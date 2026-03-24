import schedule
import time
from pathlib import Path
from job_scraper import ActuarialJobScraper

def scrape_jobs():
    """Scheduled job scraping"""
    print(f"\n⏰ Starting scheduled scrape at {time.strftime('%Y-%m-%d %H:%M:%S')}")
    repo_root = Path(__file__).resolve().parents[2]
    jobs_output_dir = repo_root / "src" / "content" / "jobs"
    json_output_file = repo_root / "actuarial_jobs.json"
    
    scraper = ActuarialJobScraper(location="India")
    jobs = scraper.scrape_all()
    scraper.save_to_json(str(json_output_file))
    scraper.save_individual_files(str(jobs_output_dir))
    
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
