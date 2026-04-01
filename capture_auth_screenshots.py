"""
Capture authenticated screenshots - tries multiple admin credentials
"""
import asyncio, os
from playwright.async_api import async_playwright

SCREENSHOTS_DIR = os.path.join(os.path.dirname(os.path.abspath(__file__)), "screenshots")
BASE_URL = "http://localhost:3001"

async def main():
    os.makedirs(SCREENSHOTS_DIR, exist_ok=True)
    
    async with async_playwright() as p:
        browser = await p.chromium.launch(headless=True)
        context = await browser.new_context(viewport={"width": 1440, "height": 900})
        page = await context.new_page()
        
        # Try manufacturer login with various credentials
        credentials = [
            ("darshanchoudhari22@gmail.com", "Admin@123"),
            ("darshanchoudhari22@gmail.com", "Darshan@123"),
            ("darshanchoudhari22@gmail.com", "admin123"),
            ("admin@printidcraft.com", "Admin@123"),
            ("admin@printidcraft.com", "admin123"),
        ]
        
        logged_in = False
        for email, password in credentials:
            print(f"Trying: {email} / {password}")
            await page.goto(f"{BASE_URL}/login?mode=admin", wait_until="networkidle")
            await page.wait_for_timeout(1500)
            
            await page.fill('#email', email)
            await page.fill('#password', password)
            await page.click('button[type="submit"]')
            await page.wait_for_timeout(4000)
            
            current_url = page.url
            print(f"  Current URL: {current_url}")
            
            if '/dashboard' in current_url or '/schools' in current_url:
                logged_in = True
                print(f"  ✅ Login successful!")
                break
            else:
                print(f"  ❌ Login failed")
        
        if logged_in:
            # Manufacturer Dashboard
            print("📸 Capturing Manufacturer Dashboard...")
            await page.goto(f"{BASE_URL}/dashboard", wait_until="networkidle")
            await page.wait_for_timeout(3000)
            await page.screenshot(path=os.path.join(SCREENSHOTS_DIR, "08_manufacturer_dashboard.png"))
            
            # Schools page
            print("📸 Capturing Schools Page...")
            await page.goto(f"{BASE_URL}/schools", wait_until="networkidle")
            await page.wait_for_timeout(3000)
            await page.screenshot(path=os.path.join(SCREENSHOTS_DIR, "09_schools_list.png"))
            
            # Try to click first school
            try:
                school_cards = page.locator('.school-card')
                count = await school_cards.count()
                print(f"Found {count} school cards")
                
                if count > 0:
                    await school_cards.first.click()
                    await page.wait_for_timeout(3000)
                    
                    # School Detail Overview
                    print("📸 Capturing School Detail...")
                    await page.screenshot(path=os.path.join(SCREENSHOTS_DIR, "12_school_overview.png"))
                    
                    # Scroll down for teacher credentials
                    await page.evaluate("window.scrollBy(0, 500)")
                    await page.wait_for_timeout(500)
                    await page.screenshot(path=os.path.join(SCREENSHOTS_DIR, "13_school_teacher_login.png"))
                    
                    # Click tabs
                    for tab_name, screenshot_name in [
                        ("classes", "15_school_classes.png"),
                        ("students", "17_school_students.png"),
                        ("template", "19_template_tab.png"),
                        ("generate", "21_generate_tab.png"),
                        ("batches", "22_batches_tab.png"),
                        ("export", "23_export_tab.png"),
                    ]:
                        try:
                            tab = page.locator(f'button:text-is("{tab_name}")')
                            if await tab.count() == 0:
                                tab = page.locator(f'button:has-text("{tab_name}")')
                            if await tab.count() > 0:
                                await tab.first.click()
                                await page.wait_for_timeout(2500)
                                await page.screenshot(path=os.path.join(SCREENSHOTS_DIR, screenshot_name))
                                print(f"  📸 Captured {tab_name} tab")
                        except Exception as e:
                            print(f"  ⚠ Error capturing {tab_name}: {e}")
            except Exception as e:
                print(f"⚠ School detail error: {e}")
        else:
            print("❌ Could not login with any credentials")
            # Take a screenshot of the error state
            await page.screenshot(path=os.path.join(SCREENSHOTS_DIR, "08_login_failed.png"))
        
        # Now try teacher login
        print("\n📸 Trying Teacher Login...")
        teacher_creds = [
            ("teacher@school.com", "Teacher@123"),
            ("admin@school.com", "Teacher@123"),
        ]
        
        # First find any teacher email from the database via API
        # Try to get it from school detail if we were logged in
        
        for email, password in teacher_creds:
            print(f"Trying teacher: {email} / {password}")
            await page.goto(f"{BASE_URL}/login", wait_until="networkidle")
            await page.wait_for_timeout(1500)
            await page.fill('#email', email)
            await page.fill('#password', password)
            await page.click('button[type="submit"]')
            await page.wait_for_timeout(4000)
            
            if '/teacher' in page.url:
                print(f"  ✅ Teacher login successful!")
                await page.wait_for_timeout(2000)
                await page.screenshot(path=os.path.join(SCREENSHOTS_DIR, "24_teacher_dashboard.png"))
                
                await page.evaluate("window.scrollBy(0, 500)")
                await page.wait_for_timeout(500)
                await page.screenshot(path=os.path.join(SCREENSHOTS_DIR, "25_teacher_overview_scrolled.png"))
                
                # Click Students tab
                try:
                    stab = page.locator('button:has-text("Students")')
                    if await stab.count() > 0:
                        await stab.first.click()
                        await page.wait_for_timeout(2000)
                        await page.screenshot(path=os.path.join(SCREENSHOTS_DIR, "27_teacher_students.png"))
                except:
                    pass
                
                # Click Sub-Teachers tab
                try:
                    ttab = page.locator('button:has-text("Sub-Teachers")')
                    if await ttab.count() > 0:
                        await ttab.first.click()
                        await page.wait_for_timeout(2000)
                        await page.screenshot(path=os.path.join(SCREENSHOTS_DIR, "28_sub_teachers.png"))
                except:
                    pass
                
                break
            else:
                print(f"  ❌ Teacher login failed")
        
        await browser.close()
    
    # List all screenshots
    screenshots = sorted(os.listdir(SCREENSHOTS_DIR))
    print(f"\n✅ Total screenshots: {len(screenshots)}")
    for s in screenshots:
        size = os.path.getsize(os.path.join(SCREENSHOTS_DIR, s))
        print(f"  📄 {s} ({size/1024:.0f} KB)")

if __name__ == "__main__":
    asyncio.run(main())
