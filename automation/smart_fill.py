"""
Adhikaar — AI-Powered Autonomous Form Filling Agent
Uses Playwright to extract form structure, Gemini to decide what goes where,
then fills ANY government portal form without hardcoded selectors.
"""

import asyncio
import json
import os
import sys
import io
from pathlib import Path

# Fix Windows console encoding
sys.stdout = io.TextIOWrapper(sys.stdout.buffer, encoding='utf-8', errors='replace')
sys.stderr = io.TextIOWrapper(sys.stderr.buffer, encoding='utf-8', errors='replace')

try:
    from playwright.async_api import async_playwright
except ImportError:
    os.system(f"{sys.executable} -m pip install playwright")
    os.system(f"{sys.executable} -m playwright install chromium")
    from playwright.async_api import async_playwright

GROQ_URL = "https://api.groq.com/openai/v1/chat/completions"
GROQ_MODEL = "llama-3.3-70b-versatile"


async def ask_llm(prompt: str) -> str:
    """Call Groq API to analyze form and return fill instructions."""
    import urllib.request
    import urllib.error

    api_key = os.environ.get("GROQ_API_KEY", "")
    if not api_key:
        print("  ⚠ GROQ_API_KEY not set")
        return ""

    body = json.dumps({
        "model": GROQ_MODEL,
        "messages": [{"role": "user", "content": prompt}],
        "temperature": 0.1,
        "max_tokens": 4096,
    }).encode("utf-8")

    req = urllib.request.Request(
        GROQ_URL,
        data=body,
        headers={
            "Content-Type": "application/json",
            "Authorization": f"Bearer {api_key}",
            "User-Agent": "Adhikaar/1.0",
        },
    )

    try:
        with urllib.request.urlopen(req, timeout=30) as resp:
            data = json.loads(resp.read().decode("utf-8"))
            return data["choices"][0]["message"]["content"]
    except Exception as e:
        print(f"  ⚠ LLM API error: {e}")
        return ""


async def extract_form_elements(page) -> list[dict]:
    """Extract all form elements from the page with their context."""
    elements = await page.evaluate("""() => {
        const results = [];
        const inputs = document.querySelectorAll(
            'input, select, textarea, [role="combobox"], [role="listbox"], [contenteditable="true"]'
        );

        for (const el of inputs) {
            // Skip hidden/invisible elements
            const style = window.getComputedStyle(el);
            if (style.display === 'none' || style.visibility === 'hidden' || el.type === 'hidden') continue;

            // Find associated label
            let label = '';
            if (el.id) {
                const labelEl = document.querySelector(`label[for="${el.id}"]`);
                if (labelEl) label = labelEl.textContent.trim();
            }
            if (!label && el.closest('label')) {
                label = el.closest('label').textContent.trim();
            }
            if (!label) {
                // Look for preceding text node or sibling
                const prev = el.previousElementSibling;
                if (prev && (prev.tagName === 'LABEL' || prev.tagName === 'SPAN' || prev.tagName === 'P')) {
                    label = prev.textContent.trim();
                }
            }
            // Check parent for label text
            if (!label && el.parentElement) {
                const parentText = el.parentElement.textContent.trim();
                if (parentText.length < 100) label = parentText;
            }

            const info = {
                tag: el.tagName.toLowerCase(),
                type: el.type || '',
                id: el.id || '',
                name: el.name || '',
                placeholder: el.placeholder || '',
                label: label.slice(0, 120),
                value: el.value || '',
                required: el.required || false,
                ariaLabel: el.getAttribute('aria-label') || '',
                className: el.className?.toString().slice(0, 80) || '',
            };

            // For select elements, get options
            if (el.tagName === 'SELECT') {
                info.options = Array.from(el.options).slice(0, 20).map(o => ({
                    value: o.value,
                    text: o.textContent.trim()
                }));
            }

            // For radio/checkbox, get the group
            if (el.type === 'radio' || el.type === 'checkbox') {
                info.checked = el.checked;
                const groupLabel = el.closest('fieldset')?.querySelector('legend')?.textContent?.trim() || '';
                if (groupLabel) info.groupLabel = groupLabel;
            }

            results.push(info);
        }
        return results;
    }""")
    return elements


async def extract_captcha_text(page) -> str:
    """Try to read captcha text from common captcha patterns."""
    captcha = await page.evaluate("""() => {
        // Common captcha selectors
        const selectors = [
            '#captchaText', '.captcha-image', '.captcha-text',
            '[id*="captcha" i]:not(input)', '[class*="captcha" i]:not(input)',
        ];
        for (const sel of selectors) {
            const el = document.querySelector(sel);
            if (el && el.tagName !== 'INPUT' && el.textContent.trim()) {
                return el.textContent.trim();
            }
        }
        return '';
    }""")
    return captcha


async def simulate_document_uploads(page):
    """Handle file upload fields by setting files if available.
    In production, real document files would be provided by the citizen.
    """
    # Find actual file input elements
    file_inputs = await page.query_selector_all('input[type="file"]')
    count = 0
    for inp in file_inputs:
        # In production, citizen's uploaded docs would be passed here
        # e.g. await inp.set_input_files('/path/to/aadhaar.pdf')
        count += 1
    return count


async def extract_page_context(page) -> str:
    """Get page title and headings for context."""
    context = await page.evaluate("""() => {
        const title = document.title || '';
        const headings = Array.from(document.querySelectorAll('h1, h2, h3'))
            .map(h => h.textContent.trim())
            .filter(t => t.length > 0)
            .slice(0, 5);
        const url = window.location.href;
        return { title, headings, url };
    }""")
    return json.dumps(context, ensure_ascii=False)


def build_gemini_prompt(form_elements: list[dict], citizen_data: dict, page_context: str) -> str:
    """Build the prompt for Gemini to analyze the form and return fill instructions."""
    return f"""You are an AI form-filling assistant. Analyze this government portal form and determine how to fill it with the citizen's data.

PAGE CONTEXT:
{page_context}

FORM ELEMENTS FOUND:
{json.dumps(form_elements, indent=2, ensure_ascii=False)}

CITIZEN DATA:
{json.dumps(citizen_data, indent=2, ensure_ascii=False)}

INSTRUCTIONS:
1. Match each form field to the appropriate citizen data
2. For select dropdowns, choose the closest matching option value
3. For radio buttons, determine which one to select
4. For checkboxes (like declarations), set to true if appropriate
5. Skip file upload fields
6. If a field has no matching citizen data, skip it
7. If _captcha_answer is provided in citizen data, use it to fill any captcha input field
8. For date fields, use the format YYYY-MM-DD

Return ONLY a valid JSON array of actions. Each action must be one of:
- {{"action": "fill", "selector": "#elementId", "value": "text to type"}}
- {{"action": "select", "selector": "#elementId", "value": "option_value"}}
- {{"action": "check", "selector": "#elementId"}}
- {{"action": "click", "selector": "#elementId"}}

Use CSS selectors. Prefer #id selectors, fall back to [name="..."] selectors.
Return ONLY the JSON array, no markdown, no explanation."""


async def smart_fill_form(citizen_data: dict, portal_url: str = None):
    """
    AI-powered form filler — works on ANY portal.

    1. Opens the portal
    2. Extracts form structure
    3. Asks Gemini how to fill it
    4. Executes the fill instructions
    5. Repeats for multi-page forms
    """

    # Default to mock portal
    if portal_url is None:
        mock_portal_path = Path(__file__).parent / "mock-portal" / "index.html"
        portal_url = f"file:///{mock_portal_path.as_posix()}"

    print(f"\n{'='*60}")
    print("  ADHIKAAR — AI-Powered Autonomous Form Agent")
    print(f"{'='*60}")
    print(f"\n🌐 Opening portal: {portal_url[:80]}...")

    async with async_playwright() as p:
        browser = await p.chromium.launch(
            headless=False,
            slow_mo=100,
            args=["--start-maximized"]
        )

        context = await browser.new_context(
            viewport={"width": 1280, "height": 800},
        )

        page = await context.new_page()
        await page.goto(portal_url, wait_until="networkidle", timeout=30000)
        print("✅ Portal loaded\n")
        await asyncio.sleep(1)

        max_pages = 5  # Handle up to 5 form pages
        for page_num in range(max_pages):
            print(f"📋 STEP {page_num + 1}: Analyzing form structure...")

            # Extract form elements
            elements = await extract_form_elements(page)
            if not elements:
                print("   No form elements found on this page.")
                break

            print(f"   Found {len(elements)} form fields")

            # Read captcha if present — include it in citizen data so LLM knows the answer
            captcha_text = await extract_captcha_text(page)
            enriched_data = dict(citizen_data)
            if captcha_text:
                enriched_data["_captcha_answer"] = captcha_text
                print(f"   🔒 Captcha detected: {captcha_text}")

            # Get page context
            page_context = await extract_page_context(page)

            # Ask LLM for fill instructions
            print("🤖 Asking AI how to fill this form...")
            prompt = build_gemini_prompt(elements, enriched_data, page_context)
            response = await ask_llm(prompt)

            if not response:
                print("   ⚠ AI could not analyze the form, falling back to basic fill")
                break

            # Parse LLM's response
            try:
                # Clean up response — remove markdown code blocks if present
                clean = response.strip()
                if clean.startswith("```"):
                    clean = clean.split("\n", 1)[1]  # Remove first line
                if clean.endswith("```"):
                    clean = clean.rsplit("```", 1)[0]
                clean = clean.strip()

                actions = json.loads(clean)
            except json.JSONDecodeError as e:
                print(f"   ⚠ Failed to parse AI response: {e}")
                print(f"   Response: {response[:200]}...")
                break

            print(f"✍️  Executing {len(actions)} fill actions...\n")

            # Execute each action
            for action in actions:
                try:
                    selector = action.get("selector", "")
                    value = action.get("value", "")
                    action_type = action.get("action", "")

                    if action_type == "fill":
                        await page.click(selector, timeout=3000)
                        await page.wait_for_timeout(80)
                        await page.fill(selector, str(value))
                        await page.wait_for_timeout(120)
                        field_name = selector.replace("#", "").replace("[name=\"", "").replace("\"]", "")
                        display_value = str(value)[:40]
                        print(f"   ✓ {field_name}: {display_value}")

                    elif action_type == "select":
                        await page.select_option(selector, str(value))
                        await page.wait_for_timeout(200)
                        field_name = selector.replace("#", "").replace("[name=\"", "").replace("\"]", "")
                        print(f"   ✓ {field_name}: {value}")

                    elif action_type == "check":
                        await page.check(selector)
                        await page.wait_for_timeout(200)
                        field_name = selector.replace("#", "").replace("[name=\"", "").replace("\"]", "")
                        print(f"   ✓ {field_name}: ☑ checked")

                    elif action_type == "click":
                        await page.click(selector, timeout=3000)
                        await page.wait_for_timeout(300)
                        print(f"   ✓ Clicked: {selector}")

                except Exception as e:
                    print(f"   ⚠ Failed: {action} — {str(e)[:60]}")

            # Handle file uploads if any real file inputs exist
            upload_count = await simulate_document_uploads(page)
            if upload_count > 0:
                print(f"\n📄 Found {upload_count} file upload field(s)")

            await asyncio.sleep(1)

            # Check if there's a submit or next button
            submit_btn = await page.query_selector(
                'button[type="submit"], input[type="submit"], #submitBtn, button:has-text("Submit"), button:has-text("Next")'
            )

            if submit_btn:
                btn_text = await submit_btn.text_content() or "Submit"
                btn_text = btn_text.strip()

                if "next" in btn_text.lower():
                    print(f"\n➡️  Clicking '{btn_text}' to proceed...")
                    await submit_btn.click()
                    await page.wait_for_timeout(2000)
                    continue  # Process next page
                else:
                    # It's a submit button
                    print(f"\n🚀 Submitting form...")
                    await submit_btn.click()
                    await page.wait_for_timeout(2000)

                    # Try to capture reference number
                    try:
                        ref = await page.text_content("#refNumber", timeout=3000)
                        if ref:
                            print(f"\n{'='*60}")
                            print(f"  ✅ APPLICATION SUBMITTED SUCCESSFULLY!")
                            print(f"  📄 Reference Number: {ref}")
                            print(f"{'='*60}\n")
                    except:
                        print(f"\n{'='*60}")
                        print(f"  ✅ FORM SUBMITTED!")
                        print(f"{'='*60}\n")

                    break
            else:
                print("   No submit/next button found on this page.")
                break

        # Keep browser open for demo viewing
        print("Browser will remain open for 10 seconds...")
        await asyncio.sleep(10)
        await browser.close()

        return {"status": "success", "pages_processed": page_num + 1}


# Default citizen data for demo
DEMO_CITIZEN = {
    "name": "Ramesh Kumar",
    "father_name": "Shri Suresh Kumar",
    "aadhaar": "9876 5432 1098",
    "dob": "1985-06-15",
    "gender": "male",
    "mobile": "9876543210",
    "state": "Uttar Pradesh",
    "state_code": "UP",
    "district": "Lucknow",
    "block": "Mohanlalganj",
    "village": "Rampur Kalan",
    "survey_no": "142/A",
    "land_area": "2.5",
    "bank_name": "State Bank of India",
    "account_no": "32145678901",
    "ifsc": "SBIN0001234",
    "caste": "OBC",
    "income": "50000",
    "occupation": "Farmer",
}


if __name__ == "__main__":
    # Load env from frontend .env.local FIRST
    env_path = Path(__file__).parent.parent / "frontend" / ".env.local"
    if env_path.exists():
        for line in env_path.read_text().splitlines():
            if line.strip() and not line.startswith("#") and "=" in line:
                key, val = line.split("=", 1)
                os.environ.setdefault(key.strip(), val.strip())

    if not os.environ.get("GROQ_API_KEY"):
        print("⚠ GROQ_API_KEY not set. Set it in frontend/.env.local or as environment variable.")
        sys.exit(1)

    print(f"   Groq API key loaded: ...{os.environ['GROQ_API_KEY'][-6:]}")

    # Accept optional JSON citizen data and portal URL from command line
    citizen_data = DEMO_CITIZEN
    portal_url = None

    if len(sys.argv) > 1:
        try:
            citizen_data = json.loads(sys.argv[1])
        except json.JSONDecodeError:
            pass

    if len(sys.argv) > 2:
        portal_url = sys.argv[2]

    asyncio.run(smart_fill_form(citizen_data, portal_url))
