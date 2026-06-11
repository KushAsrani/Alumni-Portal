# PrepSOM Alumni Portal 🎓

A production-ready, full-stack alumni portal designed to connect current learners with alumni for mentorship, career guidance, and community support. Built with Astro, React, TypeScript, and Python APIs for intelligent job matching and AI-powered resume analysis.

![Astro](https://img.shields.io/badge/Astro-4.0.0-purple?style=for-the-badge&logo=astro)
![React](https://img.shields.io/badge/React-18.2.0-blue?style=for-the-badge&logo=react)
![TypeScript](https://img.shields.io/badge/TypeScript-5.9-blue?style=for-the-badge&logo=typescript)
![Tailwind CSS](https://img.shields.io/badge/Tailwind-3.3-38B2AC?style=for-the-badge&logo=tailwind-css)
![Python](https://img.shields.io/badge/Python-3.x-3776ab?style=for-the-badge&logo=python)
![License](https://img.shields.io/badge/License-MIT-green?style=for-the-badge)

## ✨ Features

### Core Features
- **🎨 Fully Configurable**: Customize everything via `site.config.yml` without touching code
- **📱 Responsive Design**: Beautiful UI that works on all devices
- **🌗 Light/Dark Theme**: Switch between light and dark themes based on user preference
- **🔍 Advanced Search**: Fuzzy search with faculty and year-based filtering
- **🛠️ Developer Friendly**: TypeScript, Tailwind CSS, and modular architecture
- **🎯 SEO Optimized**: Built-in SEO features and meta tags
- **⚡ Performance**: Fast, static site generation with minimal JavaScript 

### Advanced Features
- **🤖 AI Resume Analysis**: Python-powered resume analysis and job matching using OpenAI
- **💼 Job Board**: Intelligent job scraping and recommendations for alumni
- **👥 Alumni Directory**: Comprehensive directory with multiple filtering options
- **🤖 AI Career Path Recommendations**: Personalized career advice based on alumni profiles and job market trends
- **💬 AI Chatbot Support**: AI-powered chatbot for answering alumni queries and providing support
- **📧 Mentorship Platform**: Connect alumni with current students for guidance
- **📅 Event Management**: Create and manage alumni events with RSVP functionality
- **📝 Blogging System**: Share news, stories, and updates with the community
- **🔗 Social Integration**: Connect with LinkedIn, Google, X, and more
- **🔔 Notifications & Messaging**: In-app notifications and messaging system for alumni interactions
- **📊 Admin Dashboard**: Engagement metrics, analytics, and user management
- **📈 Analytics & Reporting**: Track alumni engagement, job placements, and event attendance with built-in analytics
- **🛡️ Security**: Role-based access control, data validation, and secure API endpoints
- **🔐 Authentication**: Secure login system with role-based access control, multi-factor authentication, and single sign-on (SSO) support
- **🌐 n8n Workflow Automation**: Automated workflows for email, notifications, and integrations
- **💾 MongoDB Integration**: Scalable data storage for alumni profiles, job data, and other application data
- **⚡ Redis Caching**: Performance optimization with caching layer

## 🚀 Quick Start

### Prerequisites

- Node.js 20.x (required)
- npm or yarn
- Docker & Docker Compose (optional, for full stack)

### Installation

1. **Clone the repository**
   ```bash
   git clone https://github.com/KushAsrani/Alumni-Portal.git
   cd Alumni-Portal
   ```

2. **Install dependencies**
   ```bash
   npm install
   ```

3. **Configure environment**
   ```bash
   cp .env.example .env.local
   # Edit .env.local with your configuration
   ```

4. **Start development server**
   ```bash
   npm run dev
   ```

5. **Open your browser**
   Navigate to `http://localhost:4321`

### Docker Setup (Full Stack)

Run the entire application stack with Docker Compose:

```bash
# Copy environment template
cp .env.example .env

# Start all services
docker-compose up -d
```

This includes:
- **Frontend**: Astro app (accessible via host.docker.internal:4321)
- **n8n**: Workflow automation (http://localhost:5678)
- **PostgreSQL**: n8n database
- **Python Scraper API**: Job scraping service (http://localhost:5000)
- **Resume Analysis API**: AI-powered resume analysis (http://localhost:5001)
- **MongoDB Express**: Database UI (http://localhost:8081)
- **Redis**: Caching layer
- **Mongo Express**: MongoDB web interface

## 🛠️ Configuration

The portal is fully configurable through the `site.config.yml` file. Here's what you can customize:

### Site Information
```yaml
site:
  name: "Alumni Portal"
  description: "Connect with your institution's alumni"
  url: "https://your-domain.com"
  logo: "/favicon.ico"
  favicon: "/favicon.ico"
  hero_image: "/hero-bg.jpg"
```

### Colors
```yaml
colors:
  primary:
    500: "#22c55e"  # Main brand color
  secondary:
    500: "#eab308"  # Accent color
  accent:
    500: "#737373"  # Neutral color
```

### Navigation
```yaml
navigation:
  - label: "Home"
    url: "/"
    icon: "home"
  - label: "Alumni Directory"
    url: "/alumni/profiles"  # Note: /alumni/profiles (not /alumni)
    mega_menu: true
    submenu:
      - label: "By Year"
        url: "/alumni/years"
      - label: "By Faculty"
        url: "/alumni/faculties"
  - label: "Events"
    url: "/events"
  - label: "Job Board"
    url: "/jobs"
  - label: "Blog"
    url: "/blog"
```

### Faculties/Programs
```yaml
faculties:
  - name: "Master of Computer Application (MCA)"
    slug: "mca"
    description: "Computer Science graduates"
    icon: "code"
    color: "#22c55e"
  - name: "MMS (Masters in Management Studies)"
    slug: "mms"
    description: "Management program"
    icon: "briefcase"
    color: "#3b82f6"
```

## 📁 Project Structure

```
Alumni-Portal/
├── src/
│   ├── components/          # Reusable UI components
│   ├── layouts/            # Page layouts
│   ├── pages/              # Astro pages (routes)
│   │   ├── index.astro     # Homepage
│   │   ├── alumni/         # Alumni directory pages
│   │   ├── jobs.astro      # Job board
│   │   ├── events.astro    # Events listing
│   │   ├── blog/           # Blog pages
│   │   ├── admin/          # Admin dashboard
│   │   └── api/            # API routes
│   ├── content/            # Content collections
│   │   ├── alumni/         # Alumni profiles
│   │   ├── events/         # Event listings
│   │   └── blog/           # Blog posts
│   ├── styles/             # Global styles and CSS
│   ├── utils/              # Utility functions & API clients
│   └── lib/                # Libraries and helpers
├── api/                    # Python Flask APIs
│   ├── Dockerfile          # Scraper API container
│   └── (Flask app)
├── python_api/             # Python API implementations
│   ├── scraper_api.py      # Job scraping API
│   └── resume_api.py       # Resume analysis API
├── prisma/                 # Database schemas & migrations
├── n8n/                    # n8n workflow automation configs
├── public/                 # Static assets (images, icons, etc)
├── scripts/                # Utility scripts
├── site.config.yml         # Main configuration file
├── tailwind.config.mjs     # Tailwind CSS configuration
├── astro.config.mjs        # Astro configuration
├── docker-compose.yml      # Full stack Docker setup
├── package.json            # Node.js dependencies
└── requirements.txt        # Python dependencies
```

## 🎨 Customization

### Adding New Pages
### Astro:

1. Create a new `.astro` file in `src/pages/`
2. Import the Layout component
3. Add your content

```astro
---
import Layout from '../layouts/Layout.astro';
import { getSiteConfig } from '../utils/config';

const config = getSiteConfig();
---

<Layout title="Page Title" description="Page description">
  <section class="section">
    <h1>Your Content Here</h1>
  </section>
</Layout>
```

### React: 
1. Add React to Astro using `npm install @astrojs/react` or `npx astro add react`
2. Add React to your Astro config (`astro.config.mjs`):
```javascript
import { defineConfig } from 'astro/config';
import react from '@astrojs/react';

export default defineConfig({
  integrations: [react()],
});
```
3. Create React components in `src/components/` and import them into your Astro pages
4. Define your React components with TypeScript for type safety

```tsx
import React from 'react';
interface MyComponentProps {
  title: string;
  description: string;
}
const MyComponent: React.FC<MyComponentProps> = ({ title, description }) => {
  return (
    <div className="p-4 bg-gray-100 rounded-lg">
      <h2 className="text-xl font-bold mb-2">{title}</h2>
      <p>{description}</p>
    </div>
  );
};
export default MyComponent;
```

### Customizing Styles

- **Global CSS**: Edit `src/styles/global.css`
- **Tailwind Config**: Modify `tailwind.config.mjs`
- **Component Styles**: Use Tailwind classes or component-scoped CSS

### Adding New Content Types

1. Define schema in `src/content/config.ts`
2. Create content files in appropriate directories
3. Update components to display new content

## 📚 Content Management

### Alumni Profiles

Create alumni profiles in MongoDB alumni_profiles collection or as markdown files in `src/content/alumni/`:

```yaml
---
name: "Test User"
slug: "test-user"
faculty: "Master of Computer Application (MCA)"
year: 2026
bio: "Software engineer passionate about..."
short_bio: "Software Engineer at PrepSOM Labs"
email: "testuser@example.com"
linkedin: "https://linkedin.com/in/testuser"
current_position: "Software Engineer"
company: "PrepSOM Labs"
location: "Mumbai, Virtual"
skills: ["JavaScript", "React", "Node.js", "Python", "AI"]
open_to_mentorship: true
featured: true
---
```

### Job Listings

  Jobs are populated via web scraping and stored in MongoDB jobs collection. You can also add jobs manually:

```json
{
  "title": "Software Engineer",
  "company": "PrepSOM Labs",
  "location": "Mumbai, Virtual",
  "salary": "Rs. 8-12 LPA",
  "description": "We're looking for...",
  "posted_date": "2024-01-15",
  "featured": true
}
```

### Events

Add events in MongoDB events collection or as markdown files in `src/content/events/`:

```yaml
---
title: "Annual Alumni Meet"
slug: "annual-alumni-meet-2026"
description: "Join us for our annual gathering..."
date: 2026-12-15
time: "6:00 PM"
venue: "Main Campus"
category: "Networking"
featured: true
image: "/events/alumni-meet.jpg"
---
```

### Blog Posts

Create blog posts in MongoDB blog_posts collection or as markdown files in `src/content/blog/`:

```markdown
---
title: "Building Strong Alumni Networks"
description: "Tips for creating meaningful connections..."
author: "Admin"
publishDate: 2026-01-15
updatedDate: 2026-01-16
category: "Community"
tags: ["networking", "alumni", "community"]
image: "/blog/networking.jpg"
draft: false
---

Your blog content here...
```

### Python API
1. Create a virtual environment using `python -m venv venv`
2. Activate the virtual environment:
   - On Windows: `venv\Scripts\activate`
   - On macOS/Linux: `source venv/bin/activate`
3. Install dependencies: `pip install -r requirements.txt`
4. Run the scraper API: `python api/scraper_api.py`
5. Run the job scraper: `python scripts/job_scraper.py`
6. The scraper will populate the MongoDB jobs collection with the latest job listings.

### n8n Workflow Automation
1. Start n8n: `docker-compose up -d n8n`
2. Access n8n at `http://localhost:5678`
3. Import the job scraping workflow from `n8n/workflows/job-scraper-automation.json`
4. Configure the workflow with your MongoDB connection and scraping parameters
5. Activate the workflow to start automated job scraping
6. Monitor workflow execution and view logs in n8n dashboard

## 🚀 Deployment

### Vercel (Recommended)

1. Push your code to GitHub
```bash
git add .
git commit -m "Your commit message"
git push origin main
```
2. Connect your repository to Vercel
```bash
# If using Vercel CLI
npm run build  # Test build locally first
npm run preview # Preview production build locally
npm run deploy  # Deploy to Vercel
vercel -prod # Deploy to production
```
3. Configure environment variables in Vercel dashboard
4. Deploy automatically on every push

```bash
npm run build  # Test build locally first
npm run preview # Preview production build locally
npm run deploy  # Deploy to Vercel (if using Vercel CLI)
vercel -prod # Deploy to production
```

### Netlify

1. Build the project: `npm run build`
2. Deploy the `dist/` folder to Netlify
3. Configure build settings to run `npm run build`

### Docker Deployment

1. Build the Docker image: `docker build -t alumni-portal .`
2. Push to your registry
3. Deploy using orchestration tools (Kubernetes, Docker Swarm, etc.)

### Self-Hosted

The theme generates static files, so it works with any static hosting service (GitHub Pages, GitLab Pages, AWS S3, etc.).

## 🔧 Available Scripts

### Frontend
```bash
npm run dev              # Start development server
npm run build            # Build for production
npm run preview          # Preview production build locally
npm run astro            # Run Astro CLI commands
```

### Database
```bash
npm run db:setup         # Initialize MongoDB
npm run db:migrate       # Run migrations
npm run seed             # Seed database with sample data
```

### Job Scraping
```bash
npm run scrape:basic     # Basic job scraping
npm run scrape:advanced  # Advanced scraping with filters
npm run scrape:api       # Run Python scraper API
npm run scrape:jobs      # Full job scraper
npm run scrape:jobs:dev  # Job scraper with verbose output
```

### Resume Analysis
```bash
npm run resume:api       # Start resume analysis API
```

## 📊 Tech Stack

| Layer | Technology |
|-------|-----------|
| **Frontend** | Astro, React, TypeScript, Tailwind CSS (58.1% of codebase) |
| **Backend APIs** | Python Flask, OpenAI API (13.7% of codebase) |
| **Scripting** | Python, Node.js, Shell |
| **Database** | MongoDB (application data), PostgreSQL (n8n) |
| **Caching** | Redis |
| **Automation** | n8n Workflows |
| **Deployment** | Docker, Docker Compose, Vercel |
| **Configuration** | YAML, JavaScript |

## 🤝 Contributing

We welcome contributions from the community! Here's how you can help:

### Getting Started

1. Fork the repository
2. Create a feature branch: `git checkout -b feature/your-feature`
3. Make your changes
4. Commit: `git commit -m 'Add feature: description'`
5. Push: `git push origin feature/your-feature`
6. Open a Pull Request

### Development Guidelines

- Follow the existing code style
- Add TypeScript types where appropriate
- Test your changes locally: `npm run dev`
- Update documentation if needed
- Ensure responsive design works on mobile devices
- Test with Docker: `docker-compose up`

### Areas to Contribute

- 🎨 UI/UX improvements
- 🚀 Performance optimizations
- 📱 Mobile experience enhancements
- 🌍 Internationalization support (i18n)
- 🔧 Additional customization options
- 📚 Documentation improvements
- 🐛 Bug fixes
- 🤖 AI/ML features
- 🔌 API integrations

## 📖 Documentation

### For Users

- [Installation Guide](docs/installation.md)
- [Configuration Reference](docs/configuration.md)
- [Content Management Guide](docs/content.md)
- [Customization Guide](docs/customization.md)
- [Deployment Guide](docs/deployment.md)

### For Developers

- [Architecture Overview](docs/architecture.md)
- [Component API](docs/components.md)
- [Content Collections](docs/collections.md)
- [Python APIs & Scraping](docs/python-apis.md)
- [Styling System](docs/styling.md)
- [Testing Guide](docs/testing.md)
- [Docker Setup](docs/docker.md)

## 🎯 Roadmap

### Completed ✅
- Alumni Directory with search and filtering
- Job Board with intelligent scraping
- AI Resume Analysis
- Mentorship matching system
- Admin Dashboard
- Analytics & Reporting
- Event Management
- Notifications & Messaging
- Event registration and ticketing system
- Blog System
- Docker/Docker-Compose setup

### In Progress 🚧
- Advanced search filters with tags
- Enhanced mentorship matching algorithms
- AI Chatbot for support
- Social media integrations (LinkedIn, X, etc.)
- Automated email campaigns and newsletters
- Mobile app

### Planned Features 📋
- [ ] Alumni directory export (CSV, PDF)
- [ ] Newsletter/Email campaign integration
- [ ] Multi-language support (i18n)
- [ ] Video mentoring sessions
- [ ] Live event streaming and virtual meetups
- [ ] Automated career path recommendations

## 📝 Environment Variables

Create a `.env.local` file for development:

```bash
# Frontend
SITE_URL=http://localhost:4321

# MongoDB
MONGODB_URI=mongodb+srv://user:password@cluster.mongodb.net/alumni-portal

# APIs
OPENAI_API_KEY=your_openai_key
BLOB_READ_WRITE_TOKEN=your_blob_token

# n8n (if using Docker)
N8N_ENCRYPTION_KEY=your_random_encryption_key

# Admin
ADMIN_API_KEY=your_admin_api_key
```

## 🤝 Support

- 📧 Email: contact@prepsom.com
- 🐙 GitHub Issues: [Report bugs](https://github.com/KushAsrani/Alumni-Portal/issues)
- 💬 Discussions: [Ask questions](https://github.com/KushAsrani/Alumni-Portal/discussions)

## 📄 License

This project is licensed under the MIT License - see the [LICENSE](LICENSE) file for details.

## 🙏 Acknowledgments

- Built with [Astro](https://astro.build) and [React](https://reactjs.org) components
- Styled with [Tailwind CSS](https://tailwindcss.com)
- Automation with [n8n](https://n8n.io)
- Data management with [MongoDB](https://www.mongodb.com), [Redis](https://redis.io), and [PostgreSQL](https://www.postgresql.org)
- AI features powered by [OpenAI](https://openai.com)

---

**Made with ❤️ by the PrepSOM team | [PrepSOM Labs](https://prepsom.com)**
