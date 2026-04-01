"""
Screenshot capture script for Print ID Craft User Manual.
Captures screenshots of all public pages using Playwright.
"""
import asyncio
import os
from playwright.async_api import async_playwright

SCREENSHOTS_DIR = os.path.join(os.path.dirname(__file__), "screenshots")
BASE_URL = "http://localhost:3001"

async def main():
    os.makedirs(SCREENSHOTS_DIR, exist_ok=True)
    
    async with async_playwright() as p:
        browser = await p.chromium.launch(headless=True)
        context = await browser.new_context(viewport={"width": 1440, "height": 900})
        page = await context.new_page()
        
        # 1. Landing Page - Hero Section
        print("📸 Capturing Landing Page - Hero Section...")
        await page.goto(f"{BASE_URL}/", wait_until="networkidle")
        await page.wait_for_timeout(2000)
        await page.screenshot(path=os.path.join(SCREENSHOTS_DIR, "01_landing_hero.png"))
        
        # 2. Landing Page - Full page
        print("📸 Capturing Landing Page - Full...")
        await page.screenshot(path=os.path.join(SCREENSHOTS_DIR, "02_landing_full.png"), full_page=True)
        
        # 3. Landing Page - Stats Section
        print("📸 Capturing Landing Page - Stats...")
        await page.evaluate("window.scrollBy(0, 700)")
        await page.wait_for_timeout(500)
        await page.screenshot(path=os.path.join(SCREENSHOTS_DIR, "03_landing_stats.png"))
        
        # 4. Landing Page - Partnership Section
        print("📸 Capturing Landing Page - Partnership...")
        await page.evaluate("window.scrollBy(0, 600)")
        await page.wait_for_timeout(500)
        await page.screenshot(path=os.path.join(SCREENSHOTS_DIR, "04_landing_partnership.png"))
        
        # 5. Landing Page - Footer
        print("📸 Capturing Landing Page - Footer...")
        await page.evaluate("window.scrollTo(0, document.body.scrollHeight)")
        await page.wait_for_timeout(500)
        await page.screenshot(path=os.path.join(SCREENSHOTS_DIR, "05_landing_footer.png"))
        
        # 6. Teacher Login Page
        print("📸 Capturing Teacher Login Page...")
        await page.goto(f"{BASE_URL}/login", wait_until="networkidle")
        await page.wait_for_timeout(1500)
        await page.screenshot(path=os.path.join(SCREENSHOTS_DIR, "06_teacher_login.png"))
        
        # 7. Manufacturer Login Page
        print("📸 Capturing Manufacturer Login Page...")
        await page.goto(f"{BASE_URL}/login?mode=admin", wait_until="networkidle")
        await page.wait_for_timeout(1500)
        await page.screenshot(path=os.path.join(SCREENSHOTS_DIR, "07_manufacturer_login.png"))
        
        # Try to login as manufacturer (admin)
        print("📸 Attempting Manufacturer Login...")
        try:
            await page.fill('#email', 'darshanchoudhari22@gmail.com')
            await page.fill('#password', 'Admin@123')
            await page.click('button[type="submit"]')
            await page.wait_for_timeout(4000)
            
            # 8. Manufacturer Dashboard
            if '/dashboard' in page.url:
                print("📸 Capturing Manufacturer Dashboard...")
                await page.wait_for_timeout(2000)
                await page.screenshot(path=os.path.join(SCREENSHOTS_DIR, "08_manufacturer_dashboard.png"))
                
                # 9. Navigate to Schools page
                print("📸 Capturing Schools Management...")
                await page.goto(f"{BASE_URL}/schools", wait_until="networkidle")
                await page.wait_for_timeout(2000)
                await page.screenshot(path=os.path.join(SCREENSHOTS_DIR, "09_schools_list.png"))
                
                # Scroll down to see school cards
                await page.evaluate("window.scrollBy(0, 400)")
                await page.wait_for_timeout(500)
                await page.screenshot(path=os.path.join(SCREENSHOTS_DIR, "10_schools_cards.png"))
                
                # Click Add School button to show modal
                print("📸 Capturing Add School Modal...")
                try:
                    add_btn = page.locator('button:has-text("Add School")')
                    if await add_btn.count() > 0:
                        await add_btn.click()
                        await page.wait_for_timeout(1000)
                        await page.screenshot(path=os.path.join(SCREENSHOTS_DIR, "11_add_school_modal.png"))
                        # Close modal
                        await page.keyboard.press("Escape")
                        await page.wait_for_timeout(500)
                except:
                    pass
                
                # Navigate to first school detail
                print("📸 Capturing School Detail Page...")
                try:
                    school_card = page.locator('.school-card').first
                    if await school_card.count() > 0:
                        await school_card.click()
                        await page.wait_for_timeout(3000)
                        
                        # 12. School Detail - Overview
                        await page.screenshot(path=os.path.join(SCREENSHOTS_DIR, "12_school_overview.png"))
                        
                        # Scroll to see teacher credentials
                        await page.evaluate("window.scrollBy(0, 400)")
                        await page.wait_for_timeout(500)
                        await page.screenshot(path=os.path.join(SCREENSHOTS_DIR, "13_school_teacher_login.png"))
                        
                        # Scroll to logo section
                        await page.evaluate("window.scrollBy(0, 400)")
                        await page.wait_for_timeout(500)
                        await page.screenshot(path=os.path.join(SCREENSHOTS_DIR, "14_school_logo_section.png"))
                        
                        # Click Classes tab
                        print("📸 Capturing Classes Tab...")
                        try:
                            classes_tab = page.locator('button:has-text("classes")')
                            if await classes_tab.count() > 0:
                                await classes_tab.click()
                                await page.wait_for_timeout(2000)
                                await page.screenshot(path=os.path.join(SCREENSHOTS_DIR, "15_school_classes.png"))
                                
                                # Scroll to see form links
                                await page.evaluate("window.scrollBy(0, 400)")
                                await page.wait_for_timeout(500)
                                await page.screenshot(path=os.path.join(SCREENSHOTS_DIR, "16_class_form_links.png"))
                        except:
                            pass
                        
                        # Click Students tab
                        print("📸 Capturing Students Tab...")
                        try:
                            students_tab = page.locator('button:has-text("students")')
                            if await students_tab.count() > 0:
                                await students_tab.click()
                                await page.wait_for_timeout(2000)
                                await page.screenshot(path=os.path.join(SCREENSHOTS_DIR, "17_school_students.png"))
                                
                                await page.evaluate("window.scrollBy(0, 400)")
                                await page.wait_for_timeout(500)
                                await page.screenshot(path=os.path.join(SCREENSHOTS_DIR, "18_student_table.png"))
                        except:
                            pass
                        
                        # Click Template tab
                        print("📸 Capturing Template Tab...")
                        try:
                            template_tab = page.locator('button:has-text("template")')
                            if await template_tab.count() > 0:
                                await template_tab.click()
                                await page.wait_for_timeout(2000)
                                await page.screenshot(path=os.path.join(SCREENSHOTS_DIR, "19_template_tab.png"))
                                
                                await page.evaluate("window.scrollBy(0, 400)")
                                await page.wait_for_timeout(500)
                                await page.screenshot(path=os.path.join(SCREENSHOTS_DIR, "20_template_mapper.png"))
                        except:
                            pass
                        
                        # Click Generate tab
                        print("📸 Capturing Generate Tab...")
                        try:
                            gen_tab = page.locator('button:has-text("generate")')
                            if await gen_tab.count() > 0:
                                await gen_tab.click()
                                await page.wait_for_timeout(2000)
                                await page.screenshot(path=os.path.join(SCREENSHOTS_DIR, "21_generate_tab.png"))
                        except:
                            pass
                        
                        # Click Batches tab
                        print("📸 Capturing Batches Tab...")
                        try:
                            batch_tab = page.locator('button:has-text("batches")')
                            if await batch_tab.count() > 0:
                                await batch_tab.click()
                                await page.wait_for_timeout(2000)
                                await page.screenshot(path=os.path.join(SCREENSHOTS_DIR, "22_batches_tab.png"))
                        except:
                            pass
                        
                        # Click Export tab
                        print("📸 Capturing Export Tab...")
                        try:
                            export_tab = page.locator('button:has-text("export")')
                            if await export_tab.count() > 0:
                                await export_tab.click()
                                await page.wait_for_timeout(2000)
                                await page.screenshot(path=os.path.join(SCREENSHOTS_DIR, "23_export_tab.png"))
                        except:
                            pass
                except Exception as e:
                    print(f"⚠ School detail error: {e}")
            else:
                print(f"⚠ Login may have failed, current URL: {page.url}")
        except Exception as e:
            print(f"⚠ Manufacturer login error: {e}")
        
        # Now try Teacher login
        print("📸 Attempting Teacher Login...")
        try:
            await page.goto(f"{BASE_URL}/login", wait_until="networkidle")
            await page.wait_for_timeout(1500)
            
            # Try common teacher credentials
            for email_try in ['teacher@school.com', 'admin@school.com']:
                await page.fill('#email', email_try)
                await page.fill('#password', 'Teacher@123')
                await page.click('button[type="submit"]')
                await page.wait_for_timeout(3000)
                
                if '/teacher/dashboard' in page.url:
                    print("📸 Capturing Teacher Dashboard...")
                    await page.wait_for_timeout(2000)
                    await page.screenshot(path=os.path.join(SCREENSHOTS_DIR, "24_teacher_dashboard.png"))
                    
                    # Scroll down
                    await page.evaluate("window.scrollBy(0, 400)")
                    await page.wait_for_timeout(500)
                    await page.screenshot(path=os.path.join(SCREENSHOTS_DIR, "25_teacher_class_links.png"))
                    
                    await page.evaluate("window.scrollBy(0, 400)")
                    await page.wait_for_timeout(500)
                    await page.screenshot(path=os.path.join(SCREENSHOTS_DIR, "26_teacher_class_breakdown.png"))
                    
                    # Click Students tab
                    try:
                        stud_tab = page.locator('button:has-text("Students")')
                        if await stud_tab.count() > 0:
                            await stud_tab.click()
                            await page.wait_for_timeout(2000)
                            await page.screenshot(path=os.path.join(SCREENSHOTS_DIR, "27_teacher_students.png"))
                    except:
                        pass
                    
                    # Click Sub-Teachers tab
                    try:
                        sub_tab = page.locator('button:has-text("Sub-Teachers")')
                        if await sub_tab.count() > 0:
                            await sub_tab.click()
                            await page.wait_for_timeout(2000)
                            await page.screenshot(path=os.path.join(SCREENSHOTS_DIR, "28_sub_teachers.png"))
                    except:
                        pass
                    
                    # Click Template tab
                    try:
                        tmpl_tab = page.locator('button:has-text("ID Template")')
                        if await tmpl_tab.count() > 0:
                            await tmpl_tab.click()
                            await page.wait_for_timeout(2000)
                            await page.screenshot(path=os.path.join(SCREENSHOTS_DIR, "29_teacher_template.png"))
                    except:
                        pass
                    
                    break
                else:
                    await page.goto(f"{BASE_URL}/login", wait_until="networkidle")
                    await page.wait_for_timeout(1000)
        except Exception as e:
            print(f"⚠ Teacher login error: {e}")
        
        # Student submission form (public page)
        print("📸 Capturing Student Submission Form...")
        try:
            await page.goto(f"{BASE_URL}/submit/test-token-invalid", wait_until="networkidle")
            await page.wait_for_timeout(2000)
            await page.screenshot(path=os.path.join(SCREENSHOTS_DIR, "30_submit_error.png"))
        except:
            pass
        
        await browser.close()
    
    # List all captured screenshots
    screenshots = sorted(os.listdir(SCREENSHOTS_DIR))
    print(f"\n✅ Captured {len(screenshots)} screenshots:")
    for s in screenshots:
        print(f"  📄 {s}")

if __name__ == "__main__":
    asyncio.run(main())
