import requests
from flask import Flask, jsonify, request
from flask_cors import CORS
import sys
import os
import json
import threading
import time
from datetime import datetime
from typing import Dict, List, Optional

# Add parent directory to path for imports
sys.path.append(os.path.join(os.path.dirname(__file__), '..', 'scripts', 'python'))
from job_scraper import ActuarialJobScraper

app = Flask(__name__)
CORS(app)  # Enable CORS for all routes

# In-memory storage for scraping status (use Redis in production)
scraping_status = {
    'is_running': False,
    'progress': 0,
    'total_jobs': 0,
    'status_message': 'Idle',
    'started_at': None,
    'completed_at': None,
    'errors': [],
    'last_scrape': None
}

# Store latest scraped jobs
latest_jobs_cache = []

# Function to save jobs to portal via API
def save_jobs_to_portal(jobs, portal_url='http://localhost:4321', api_key=None):
    """Save scraped jobs to portal via API"""
    try:
        headers = {
            'Content-Type': 'application/json',
        }
        
        # Add authentication if provided
        if api_key:
            headers['Authorization'] = f'Bearer {api_key}'
        
        # Send jobs in batches of 50
        batch_size = 50
        for i in range(0, len(jobs), batch_size):
            batch = jobs[i:i + batch_size]
            
            response = requests.post(
                f'{portal_url}/api/jobs/create',
                json=batch,
                headers=headers,
                timeout=30
            )
            
            if response.status_code == 200:
                result = response.json()
                print(f"✅ Batch {i//batch_size + 1}: Inserted {result['data']['inserted']}, Updated {result['data']['updated']}")
            else:
                print(f"❌ Batch {i//batch_size + 1} failed: {response.text}")
        
        print(f"\n✅ Successfully posted {len(jobs)} jobs to portal")
        return True
        
    except Exception as e:
        print(f"\n❌ Error posting jobs to portal: {str(e)}")
        return False

def run_scraper_async(location: str, keywords: List[str], max_pages: int):
    """Run scraper in background thread"""
    global scraping_status, latest_jobs_cache
    
    try:
        # Update status
        scraping_status['is_running'] = True
        scraping_status['progress'] = 0
        scraping_status['status_message'] = 'Initializing scraper...'
        scraping_status['started_at'] = datetime.now().isoformat()
        scraping_status['errors'] = []
        
        # Initialize scraper
        scraper = ActuarialJobScraper(location=location, keywords=keywords)
        
        scraping_status['status_message'] = 'Scraping jobs from Naukri...'
        scraping_status['progress'] = 10
        
        # Scrape from all sources
        naukri_jobs = scraper.scrape_naukri(max_pages=max_pages)
        scraping_status['progress'] = 40
        
        scraping_status['status_message'] = 'Scraping jobs from Indeed...'
        indeed_jobs = scraper.scrape_indeed_india(max_pages=max_pages)
        scraping_status['progress'] = 70
        
        scraping_status['status_message'] = 'Scraping jobs from LinkedIn...'
        linkedin_jobs = scraper.scrape_linkedin_india(max_pages=2)
        scraping_status['progress'] = 90
        
        # Combine results
        all_jobs = naukri_jobs + indeed_jobs + linkedin_jobs
        scraper.jobs = all_jobs
        
        # Save to files
        scraping_status['status_message'] = 'Saving results...'
        scraper.save_to_json('../scripts/python/actuarial_jobs_india.json')
        scraper.save_individual_files('../src/content/jobs')

        # After scraping is complete, post to portal
        portal_url = os.getenv('PORTAL_URL', 'http://localhost:4321')
        admin_api_key = os.getenv('ADMIN_API_KEY')
        
        if save_jobs_to_portal(all_jobs, portal_url, admin_api_key):
            scraping_status['status_message'] = 'Jobs posted to portal successfully!'
        else:
            scraping_status['status_message'] = 'Scraping complete but failed to post to portal'
        
        # Update cache
        latest_jobs_cache = all_jobs
        
        # Update status
        scraping_status['is_running'] = False
        scraping_status['progress'] = 100
        scraping_status['total_jobs'] = len(all_jobs)
        scraping_status['status_message'] = f'Completed successfully! Found {len(all_jobs)} jobs.'
        scraping_status['completed_at'] = datetime.now().isoformat()
        scraping_status['last_scrape'] = {
            'timestamp': datetime.now().isoformat(),
            'total_jobs': len(all_jobs),
            'sources': {
                'naukri': len(naukri_jobs),
                'indeed': len(indeed_jobs),
                'linkedin': len(linkedin_jobs)
            }
        }
        
    except Exception as e:
        scraping_status['is_running'] = False
        scraping_status['status_message'] = f'Error: {str(e)}'
        scraping_status['errors'].append({
            'timestamp': datetime.now().isoformat(),
            'error': str(e)
        })
        scraping_status['completed_at'] = datetime.now().isoformat()


@app.route('/')
def index():
    """API home"""
    return jsonify({
        'name': 'Actuarial Job Scraper API',
        'version': '1.0.0',
        'status': 'running',
        'endpoints': {
            'scrape': '/api/scrape',
            'status': '/api/status',
            'jobs': '/api/jobs',
            'stats': '/api/stats'
        }
    })


@app.route('/api/scrape', methods=['POST'])
def trigger_scrape():
    """Trigger job scraping"""
    global scraping_status
    
    # Check if already running
    if scraping_status['is_running']:
        return jsonify({
            'success': False,
            'message': 'Scraping is already in progress',
            'status': scraping_status
        }), 409
    
    # Get parameters
    data = request.get_json() or {}
    location = data.get('location', 'India')
    keywords = data.get('keywords', [
        'actuarial analyst',
        'actuary',
        'actuarial scientist',
        'risk analyst',
        'insurance analyst'
    ])
    max_pages = data.get('max_pages', 3)
    
    # Validate parameters
    if max_pages > 10:
        return jsonify({
            'success': False,
            'message': 'max_pages cannot exceed 10'
        }), 400
    
    # Start scraping in background thread
    thread = threading.Thread(
        target=run_scraper_async,
        args=(location, keywords, max_pages)
    )
    thread.daemon = True
    thread.start()
    
    return jsonify({
        'success': True,
        'message': 'Scraping started',
        'status': scraping_status
    }), 202


@app.route('/api/status', methods=['GET'])
def get_status():
    """Get current scraping status"""
    return jsonify({
        'success': True,
        'status': scraping_status
    })


@app.route('/api/jobs', methods=['GET'])
def get_jobs():
    """Get latest scraped jobs"""
    # Get query parameters
    limit = request.args.get('limit', default=50, type=int)
    source = request.args.get('source', default=None, type=str)
    location = request.args.get('location', default=None, type=str)
    min_salary = request.args.get('min_salary', default=None, type=int)
    
    # Filter jobs
    filtered_jobs = latest_jobs_cache.copy()
    
    if source:
        filtered_jobs = [j for j in filtered_jobs if j['source'].lower() == source.lower()]
    
    if location:
        filtered_jobs = [j for j in filtered_jobs if location.lower() in j['location'].lower()]
    
    if min_salary:
        filtered_jobs = [j for j in filtered_jobs if j.get('salary') and j['salary']['min'] >= min_salary]
    
    # Apply limit
    filtered_jobs = filtered_jobs[:limit]
    
    return jsonify({
        'success': True,
        'total': len(filtered_jobs),
        'jobs': filtered_jobs
    })


@app.route('/api/stats', methods=['GET'])
def get_stats():
    """Get statistics about scraped jobs"""
    if not latest_jobs_cache:
        return jsonify({
            'success': True,
            'stats': {
                'total_jobs': 0,
                'message': 'No jobs scraped yet'
            }
        })
    
    # Calculate statistics
    total_jobs = len(latest_jobs_cache)
    
    # By source
    by_source = {}
    for job in latest_jobs_cache:
        source = job['source']
        by_source[source] = by_source.get(source, 0) + 1
    
    # By experience level
    by_experience = {}
    for job in latest_jobs_cache:
        level = job['experienceLevel']
        by_experience[level] = by_experience.get(level, 0) + 1
    
    # By location
    by_location = {}
    for job in latest_jobs_cache:
        location = job['location']
        by_location[location] = by_location.get(location, 0) + 1
    
    # Salary statistics
    jobs_with_salary = [j for j in latest_jobs_cache if j.get('salary')]
    avg_min_salary = sum(j['salary']['min'] for j in jobs_with_salary) / len(jobs_with_salary) if jobs_with_salary else 0
    avg_max_salary = sum(j['salary']['max'] for j in jobs_with_salary) / len(jobs_with_salary) if jobs_with_salary else 0
    
    # Top skills
    skill_counts = {}
    for job in latest_jobs_cache:
        for skill in job.get('skills', []):
            skill_counts[skill] = skill_counts.get(skill, 0) + 1
    
    top_skills = sorted(skill_counts.items(), key=lambda x: x[1], reverse=True)[:10]
    
    return jsonify({
        'success': True,
        'stats': {
            'total_jobs': total_jobs,
            'by_source': by_source,
            'by_experience': by_experience,
            'by_location': dict(sorted(by_location.items(), key=lambda x: x[1], reverse=True)[:10]),
            'salary': {
                'jobs_with_salary': len(jobs_with_salary),
                'avg_min_lakhs': round(avg_min_salary / 100000, 2),
                'avg_max_lakhs': round(avg_max_salary / 100000, 2)
            },
            'top_skills': [{'skill': skill, 'count': count} for skill, count in top_skills],
            'last_scrape': scraping_status.get('last_scrape')
        }
    })


@app.route('/api/stop', methods=['POST'])
def stop_scrape():
    """Stop current scraping (if possible)"""
    global scraping_status
    
    if not scraping_status['is_running']:
        return jsonify({
            'success': False,
            'message': 'No scraping in progress'
        }), 400
    
    # Note: In a production system, you'd need a proper way to stop threads
    # For now, we just mark it as stopped
    scraping_status['status_message'] = 'Stopping...'
    
    return jsonify({
        'success': True,
        'message': 'Stop signal sent'
    })


@app.route('/health', methods=['GET'])
def health_check():
    """Health check endpoint"""
    return jsonify({
        'status': 'healthy',
        'timestamp': datetime.now().isoformat(),
        'scraper_status': 'running' if scraping_status['is_running'] else 'idle'
    })


if __name__ == '__main__':
    # Run Flask app
    port = int(os.environ.get('FLASK_PORT', 5000))
    app.run(host='0.0.0.0', port=port, debug=True)