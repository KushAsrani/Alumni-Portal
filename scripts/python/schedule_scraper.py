import schedule
import time
from job_scraper import ActuarialJobScraper

def scrape_jobs():
    """Scheduled job scraping"""
    print(f"\n⏰ Starting scheduled scrape at {time.strftime('%Y-%m-%d %H:%M:%S')}")
    
    scraper = ActuarialJobScraper(location="India")
    jobs = scraper.scrape_all()
    scraper.save_to_json('actuarial_jobs.json')
    scraper.save_individual_files('../src/content/jobs')
    
    print(f"✅ Scheduled scrape completed: {len(jobs)} jobs")

# Schedule scraping every 6 hours
schedule.every(6).hours.do(scrape_jobs)

# Or daily at specific time
# schedule.every().day.at("02:00").do(scrape_jobs)

print("🤖 Job scraper scheduler started")
print("📅 Will scrape every 6 hours")
print("Press Ctrl+C to stop")

# Run immediately on start
scrape_jobs()

# Keep running
while True:
    schedule.run_pending()
    time.sleep(60)