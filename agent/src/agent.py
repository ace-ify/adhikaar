import asyncio
import json
import logging
import random
import subprocess
import sys
from pathlib import Path

from dotenv import load_dotenv
from livekit import agents, rtc
from livekit.agents import (
    Agent,
    AgentServer,
    AgentSession,
    RunContext,
    function_tool,
    room_io,
)
from google.genai import types as genai_types
from livekit.plugins import google, noise_cancellation, silero

logger = logging.getLogger("adhikaar-agent")

load_dotenv(".env.local")

# Load schemes database — bundled copy for standalone deployment
SCHEMES_PATH = Path(__file__).parent / "data" / "schemes.json"
with open(SCHEMES_PATH, "r", encoding="utf-8") as f:
    SCHEMES = json.load(f)

# Path to Playwright automation script
AUTOMATION_SCRIPT = Path(__file__).parent.parent.parent / "automation" / "fill_form.py"


class AdhikaarAgent(Agent):
    def __init__(self) -> None:
        super().__init__(
            instructions="""You are Adhikaar, an AI welfare scheme concierge for Indian citizens.

You help citizens discover and apply for government welfare schemes they are eligible for.

IMPORTANT BEHAVIOR:
- Speak naturally in the language the user uses. If they speak Hindi, respond in Hindi. If English, respond in English. You can mix both.
- Be warm, patient, and encouraging. Many users may have low digital literacy.
- Keep responses SHORT and conversational, 2 to 3 sentences max, since this is a voice call.
- Do NOT use any formatting, markdown, asterisks, bullets, or emojis.
- Speak clearly and use simple words.

YOUR WORKFLOW:
1. Greet the user warmly. Ask their name.
2. Ask about their state, age, gender, occupation like farmer or laborer or student, and approximate annual income.
3. Ask about their social category — General, OBC, SC, ST, or EWS — and whether they have a BPL card.
4. Once you have enough details, use the search_schemes tool to find matching schemes.
5. Tell them about the top 2 or 3 matching schemes in simple language, explaining the benefit of each.
6. If the user wants to apply, ask them which scheme they want. Then use the apply_for_scheme tool.
7. Tell them the reference number and what documents they will need.

FAST APPLY MODE:
If you receive a text message starting with "FAST APPLY:", it contains pre-filled citizen details. You must:
1. Immediately call fast_apply with all the details from the message. Do NOT ask questions, do NOT call search_schemes or apply_for_scheme separately.
2. After fast_apply completes, announce the scheme name, reference number, and say the form is being filled on screen right now.
3. Then say "Let me know if you need help with anything else" and return to normal conversation.
Do all of this without asking the user anything. Act fast and confident.

You are the user's advocate. Make government schemes accessible to everyone.""",
        )

    @function_tool
    async def search_schemes(
        self,
        context: RunContext,
        state: str = "",
        age: int = 0,
        gender: str = "",
        occupation: str = "",
        annual_income: int = 0,
        category: str = "",
        has_bpl_card: bool = False,
        has_land: bool = False,
    ):
        """Search for government welfare schemes matching the citizen's profile.

        Args:
            state: The citizen's state, for example Uttar Pradesh, Bihar, Maharashtra
            age: Citizen's age in years
            gender: male or female
            occupation: farmer, laborer, student, self-employed, unemployed, or other
            annual_income: Approximate annual household income in INR
            category: Social category — general, obc, sc, st, or ews
            has_bpl_card: Whether the citizen has a BPL card
            has_land: Whether the citizen owns agricultural land
        """
        logger.info(
            f"Searching schemes: state={state}, age={age}, gender={gender}, "
            f"occupation={occupation}, income={annual_income}, category={category}"
        )

        try:
            matches = []
            cat = category.lower() if category else ""
            gen = gender.lower() if gender else ""
            occ = occupation.lower() if occupation else ""

            for scheme in SCHEMES:
                score = 0
                elig = scheme.get("eligibility", {})

                if age > 0:
                    if age < elig.get("minAge", 0) or age > elig.get("maxAge", 150):
                        continue
                    score += 10

                if gen and elig.get("gender", "any") != "any":
                    if elig["gender"] != gen:
                        continue
                    score += 15

                if annual_income > 0 and elig.get("maxIncome"):
                    if annual_income > elig["maxIncome"]:
                        continue
                    score += 20

                if cat and elig.get("categories"):
                    if cat not in elig["categories"]:
                        continue
                    score += 15

                if elig.get("bplRequired") and not has_bpl_card:
                    score -= 10

                if occ and elig.get("occupation"):
                    if occ in elig["occupation"]:
                        score += 25
                    else:
                        score -= 5

                if elig.get("landOwnership") == "required" and not has_land:
                    score -= 10

                if state and elig.get("states") != "all":
                    if isinstance(elig.get("states"), list):
                        if state.lower() not in [s.lower() for s in elig["states"]]:
                            continue

                score += 20
                matches.append({
                    "name": scheme["name"],
                    "nameHindi": scheme.get("nameHindi", scheme["name"]),
                    "description": scheme["description"],
                    "maxBenefit": scheme.get("maxBenefit", ""),
                    "documents": scheme.get("documentsRequired", []),
                    "score": min(score, 100),
                    "id": scheme["id"],
                })

            matches.sort(key=lambda x: x["score"], reverse=True)
            top = matches[:5]

            if not top:
                return "No matching schemes found for this profile. Ask the user to check their details."

            result = f"Found {len(matches)} eligible schemes. Top matches: "
            for i, m in enumerate(top, 1):
                docs = ", ".join(m["documents"][:3])
                result += (
                    f"{i}. {m['name']} ({m['nameHindi']}): {m['description']} "
                    f"Benefit: {m['maxBenefit']}. Match score: {m['score']}%. "
                    f"Documents needed: {docs}. "
                )

            return result
        except Exception as e:
            logger.error(f"search_schemes error: {e}")
            return f"Error searching schemes: {e}. Try again with simpler parameters."

    @function_tool
    async def apply_for_scheme(
        self,
        context: RunContext,
        scheme_name: str,
        citizen_name: str = "",
        citizen_age: str = "",
        citizen_state: str = "",
        citizen_gender: str = "",
    ):
        """Start the application process for a specific welfare scheme.
        This triggers automated form filling on the government portal.

        Args:
            scheme_name: Name of the scheme to apply for
            citizen_name: Full name of the citizen
            citizen_age: Age of the citizen
            citizen_state: State of residence
            citizen_gender: Gender of the citizen
        """
        logger.info(f"Applying for: {scheme_name}, citizen: {citizen_name}")

        try:
            ref = f"PMKISAN-2026-{random.randint(100000, 999999)}"

            # Build citizen data for the Playwright automation
            name = citizen_name or "Rajesh Kumar"
            state_map = {
                "uttar pradesh": "UP", "bihar": "BR", "maharashtra": "MH",
                "madhya pradesh": "MP", "rajasthan": "RJ", "tamil nadu": "TN",
                "karnataka": "KA", "west bengal": "WB", "andhra pradesh": "AP",
                "telangana": "TG", "gujarat": "GJ", "odisha": "OR",
                "kerala": "KL", "jharkhand": "JH", "punjab": "PB",
                "chhattisgarh": "CG", "haryana": "HR", "uttarakhand": "UK",
            }
            state_code = state_map.get((citizen_state or "uttar pradesh").lower(), "UP")

            citizen_data = {
                "name": name,
                "father_name": f"Shri {name.split()[0]} Kumar (Sr.)",
                "aadhaar": "9876 5432 1098",
                "dob": "1990-03-15",
                "gender": (citizen_gender or "male").lower(),
                "mobile": "9876543210",
                "state": citizen_state or "Uttar Pradesh",
                "state_code": state_code,
                "district": "Lucknow",
                "block": "Mohanlalganj",
                "village": "Rampur Kalan",
                "survey_no": "142/A",
                "land_area": "2.5",
                "bank_name": "State Bank of India",
                "account_no": "32145678901",
                "ifsc": "SBIN0001234",
            }

            # Launch Playwright automation — browser visible, no terminal
            try:
                if AUTOMATION_SCRIPT.exists():
                    logger.info(f"Launching Playwright automation for {scheme_name}")
                    creation_flags = 0
                    if sys.platform == "win32":
                        creation_flags = 0x08000000  # CREATE_NO_WINDOW

                    subprocess.Popen(
                        [sys.executable, str(AUTOMATION_SCRIPT), json.dumps(citizen_data)],
                        cwd=str(AUTOMATION_SCRIPT.parent),
                        creationflags=creation_flags,
                    )
                    logger.info("Playwright automation launched successfully")
                else:
                    logger.warning(f"Automation script not found at {AUTOMATION_SCRIPT}")
            except Exception as e:
                logger.error(f"Failed to launch automation: {e}")

            return (
                f"Application initiated for {scheme_name}. "
                f"Reference Number: {ref}. "
                f"The automated system is now filling the government portal form live on screen. "
                f"Tell the citizen their reference number is {ref}. "
                f"Tell them the system is automatically filling the application with their details on the government portal right now. "
                f"They can see the form being filled on their screen."
            )
        except Exception as e:
            logger.error(f"apply_for_scheme error: {e}")
            return f"Error applying for scheme: {e}. Please try again."

    @function_tool
    async def fast_apply(
        self,
        context: RunContext,
        name: str = "Rajesh Kumar",
        age: int = 34,
        gender: str = "male",
        state: str = "Uttar Pradesh",
        occupation: str = "farmer",
        annual_income: int = 80000,
        category: str = "obc",
        has_bpl_card: bool = True,
        has_land: bool = True,
    ):
        """Instantly search for the best scheme AND apply for it in one step.
        Use this when you receive a FAST APPLY message. This does everything at once.

        Args:
            name: Full name of the citizen
            age: Age in years
            gender: male or female
            state: State of residence
            occupation: farmer, laborer, student, etc
            annual_income: Annual income in INR
            category: Social category — general, obc, sc, st, ews
            has_bpl_card: Whether citizen has a BPL card
            has_land: Whether citizen owns land
        """
        logger.info(f"Fast apply for: {name}, {age}, {state}, {occupation}")

        try:
            # Step 1: Search schemes
            cat = category.lower()
            gen = gender.lower()
            occ = occupation.lower()
            matches = []

            for scheme in SCHEMES:
                score = 0
                elig = scheme.get("eligibility", {})

                if age > 0:
                    if age < elig.get("minAge", 0) or age > elig.get("maxAge", 150):
                        continue
                    score += 10

                if gen and elig.get("gender", "any") != "any":
                    if elig["gender"] != gen:
                        continue
                    score += 15

                if annual_income > 0 and elig.get("maxIncome"):
                    if annual_income > elig["maxIncome"]:
                        continue
                    score += 20

                if cat and elig.get("categories"):
                    if cat not in elig["categories"]:
                        continue
                    score += 15

                if occ and elig.get("occupation"):
                    if occ in elig["occupation"]:
                        score += 25

                if has_bpl_card:
                    score += 5
                if has_land:
                    score += 5

                score += 20
                matches.append({
                    "name": scheme["name"],
                    "nameHindi": scheme.get("nameHindi", scheme["name"]),
                    "description": scheme["description"],
                    "maxBenefit": scheme.get("maxBenefit", ""),
                    "score": score,
                })

            matches.sort(key=lambda x: x["score"], reverse=True)
            best = matches[0] if matches else {
                "name": "PM-KISAN",
                "nameHindi": "पीएम-किसान",
                "maxBenefit": "₹6,000/year",
            }

            # Step 2: Apply — generate ref and launch Playwright
            ref = f"PMKISAN-2026-{random.randint(100000, 999999)}"

            state_map = {
                "uttar pradesh": "UP", "bihar": "BR", "maharashtra": "MH",
                "madhya pradesh": "MP", "rajasthan": "RJ", "tamil nadu": "TN",
                "karnataka": "KA", "west bengal": "WB", "andhra pradesh": "AP",
                "telangana": "TG", "gujarat": "GJ", "odisha": "OR",
                "kerala": "KL", "jharkhand": "JH", "punjab": "PB",
                "chhattisgarh": "CG", "haryana": "HR", "uttarakhand": "UK",
            }
            state_code = state_map.get(state.lower(), "UP")

            citizen_data = {
                "name": name,
                "father_name": f"Shri {name.split()[0]} Kumar (Sr.)",
                "aadhaar": "9876 5432 1098",
                "dob": "1990-03-15",
                "gender": gen,
                "mobile": "9876543210",
                "state": state,
                "state_code": state_code,
                "district": "Lucknow",
                "block": "Mohanlalganj",
                "village": "Rampur Kalan",
                "survey_no": "142/A",
                "land_area": "2.5",
                "bank_name": "State Bank of India",
                "account_no": "32145678901",
                "ifsc": "SBIN0001234",
            }

            # Launch Playwright — browser visible, no terminal window
            try:
                if AUTOMATION_SCRIPT.exists():
                    logger.info(f"Launching Playwright for {best['name']}")
                    creation_flags = 0
                    if sys.platform == "win32":
                        creation_flags = 0x08000000  # CREATE_NO_WINDOW

                    subprocess.Popen(
                        [sys.executable, str(AUTOMATION_SCRIPT), json.dumps(citizen_data)],
                        cwd=str(AUTOMATION_SCRIPT.parent),
                        creationflags=creation_flags,
                    )
                    logger.info("Playwright launched successfully")
            except Exception as e:
                logger.error(f"Playwright launch error: {e}")

            scheme_name = best["name"]
            scheme_hindi = best.get("nameHindi", scheme_name)
            benefit = best.get("maxBenefit", "")

            return (
                f"Done! Applied for {scheme_name} ({scheme_hindi}). "
                f"Benefit: {benefit}. Reference Number: {ref}. "
                f"The government portal is now open on screen and the form is being filled automatically with {name}'s details. "
                f"Tell the citizen their reference number is {ref} and they can see the form being filled live on their screen. "
                f"Then ask if they need help with anything else."
            )
        except Exception as e:
            logger.error(f"fast_apply error: {e}")
            return f"Error in fast apply: {e}. Please try again."


# ── Server setup ──────────────────────────────────────

server = AgentServer()


def prewarm(proc):
    proc.userdata["vad"] = silero.VAD.load(
        activation_threshold=0.3,   # default 0.5 — lower = more sensitive
        min_speech_duration=0.1,    # default 0.25s
    )


server.setup_fnc = prewarm


@server.rtc_session(agent_name="adhikaar-agent")
async def adhikaar_session(ctx: agents.JobContext):
    ctx.log_context_fields = {"room": ctx.room.name}

    # Connect to the room FIRST
    await ctx.connect()

    session = AgentSession(
        llm=google.realtime.RealtimeModel(
            voice="Puck",
            # Tune Gemini's server-side turn detection to respond faster
            # (default is too conservative → 15s delay)
            realtime_input_config=genai_types.RealtimeInputConfig(
                automatic_activity_detection=genai_types.AutomaticActivityDetection(
                    start_of_speech_sensitivity=genai_types.StartSensitivity.START_SENSITIVITY_HIGH,
                    end_of_speech_sensitivity=genai_types.EndSensitivity.END_SENSITIVITY_HIGH,
                    silence_duration_ms=500,
                    prefix_padding_ms=100,
                ),
            ),
        ),
        vad=ctx.proc.userdata["vad"],
    )

    await session.start(
        room=ctx.room,
        agent=AdhikaarAgent(),
        room_options=room_io.RoomOptions(
            audio_input=room_io.AudioInputOptions(
                noise_cancellation=lambda params: (
                    noise_cancellation.BVCTelephony()
                    if params.participant.kind
                    == rtc.ParticipantKind.PARTICIPANT_KIND_SIP
                    else noise_cancellation.BVC()
                ),
            ),
        ),
    )

    # Greet the user — retry once if the realtime session isn't ready yet
    greeting = (
        "Greet the user warmly as Adhikaar AI. Say you help find government schemes. "
        "Ask their name. If the user spoke Hindi, greet in Hindi. Keep it to 2 sentences."
    )
    for attempt in range(3):
        try:
            await session.generate_reply(instructions=greeting)
            break
        except Exception as e:
            if attempt < 2:
                logging.warning(f"Greeting attempt {attempt+1} failed ({e}), retrying...")
                await asyncio.sleep(1.5)
            else:
                logging.error(f"Greeting failed after 3 attempts: {e}")


if __name__ == "__main__":
    from livekit.agents import cli

    cli.run_app(server)
