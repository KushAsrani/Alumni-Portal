import fs from 'fs';
import path from 'path';

const companies = [
  'MetLife', 'Prudential Financial', 'AIG', 'Nationwide', 'Principal Financial',
  'Lincoln Financial', 'Guardian Life', 'MassMutual', 'New York Life', 'Northwestern Mutual',
  'Aflac', 'Unum', 'Cigna', 'Humana', 'Aetna', 'Blue Cross Blue Shield',
  'State Farm', 'Allstate', 'Liberty Mutual', 'Travelers', 'Hartford Financial',
  'Willis Towers Watson', 'Mercer', 'Aon', 'Milliman', 'Oliver Wyman'
];

const cities = [
  { city: 'New York', state: 'NY' },
  { city: 'Hartford', state: 'CT' },
  { city: 'Chicago', state: 'IL' },
  { city: 'Des Moines', state: 'IA' },
  { city: 'Boston', state: 'MA' },
  { city: 'Philadelphia', state: 'PA' },
  { city: 'Charlotte', state: 'NC' },
  { city: 'Atlanta', state: 'GA' },
  { city: 'Dallas', state: 'TX' },
  { city: 'Minneapolis', state: 'MN' },
  { city: 'Milwaukee', state: 'WI' },
  { city: 'Columbus', state: 'OH' }
];

const jobTitles = [
  'Actuarial Analyst',
  'Associate Actuary',
  'Senior Actuary',
  'Pricing Actuary',
  'Reserving Actuary',
  'Valuation Actuary',
  'Life Actuary',
  'Health Actuary',
  'Pension Actuary',
  'Property & Casualty Actuary',
  'Chief Actuary',
  'Director of Actuarial Services',
  'Actuarial Manager',
  'Staff Actuary',
  'Consulting Actuary'
];

const experienceLevels = [
  { level: 'Entry Level', years: '0-2 years', salary: { min: 65000, max: 85000 } },
  { level: 'Associate', years: '2-5 years', salary: { min: 85000, max: 120000 } },
  { level: 'Mid-Level', years: '5-8 years', salary: { min: 110000, max: 150000 } },
  { level: 'Senior', years: '8-12 years', salary: { min: 140000, max: 200000 } },
  { level: 'Lead/Principal', years: '12+ years', salary: { min: 180000, max: 250000 } }
];

const jobTypes = ['Full-time', 'Contract', 'Remote', 'Hybrid'];

const skills = [
  'Excel', 'SQL', 'Python', 'R', 'SAS', 'VBA', 'Tableau', 'Power BI',
  'Prophet', 'AXIS', 'ResQ', 'MoSes', 'GGY AXIS', 'ALFA',
  'Statistical Analysis', 'Predictive Modeling', 'Risk Management'
];

const certifications = ['ASA', 'FSA', 'ACAS', 'FCAS', 'CERA', 'FIA'];

function randomItem(array) {
  return array[Math.floor(Math.random() * array.length)];
}

function randomNumber(min, max) {
  return Math.floor(Math.random() * (max - min + 1)) + min;
}

function randomDate(daysAgo) {
  const date = new Date();
  date.setDate(date.getDate() - randomNumber(1, daysAgo));
  return date.toISOString();
}

function generateDescription(title, company, location) {
  const expLevel = randomItem(experienceLevels);
  const reqSkills = [];
  for (let i = 0; i < randomNumber(4, 8); i++) {
    const skill = randomItem(skills);
    if (!reqSkills.includes(skill)) reqSkills.push(skill);
  }

  const cert = Math.random() > 0.5 ? randomItem(certifications) : null;

  return {
    description: `${company} is seeking a talented ${title} to join our actuarial team in ${location.city}, ${location.state}.

ABOUT THE ROLE:
We are looking for an experienced actuarial professional to support our growing business. You will work on pricing, reserving, and valuation projects for our ${randomItem(['life', 'health', 'P&C', 'pension'])} insurance products.

KEY RESPONSIBILITIES:
• Develop and maintain actuarial models for pricing and reserving
• Perform experience studies and trend analysis
• Prepare regulatory and financial reports
• Collaborate with finance, underwriting, and product teams
• Present findings to senior management
• Mentor junior actuarial staff

REQUIRED QUALIFICATIONS:
• ${expLevel.years} of actuarial experience
• ${cert ? `${cert} designation or progress toward` : 'Progress toward actuarial credentials (ASA/FSA or ACAS/FCAS)'}
• Strong proficiency in ${reqSkills.slice(0, 3).join(', ')}
• Excellent analytical and problem-solving skills
• Strong communication and presentation skills
• Bachelor's degree in Actuarial Science, Mathematics, Statistics, or related field

PREFERRED QUALIFICATIONS:
• Experience with ${reqSkills.slice(3, 5).join(' and ')}
• Knowledge of ${randomItem(['IFRS 17', 'US GAAP', 'PBR', 'Solvency II'])} standards
• Insurance industry experience

WHAT WE OFFER:
• Competitive salary: $${expLevel.salary.min.toLocaleString()} - $${expLevel.salary.max.toLocaleString()}
• Comprehensive health, dental, and vision insurance
• 401(k) with company match
• Exam support and study time
• Professional development opportunities
• Flexible work arrangements
• Paid time off and holidays`,
    requirements: reqSkills,
    experienceLevel: expLevel.level,
    salaryMin: expLevel.salary.min,
    salaryMax: expLevel.salary.max,
    certification: cert
  };
}

function generateJobs(count = 100) {
  console.log(`🎲 Generating ${count} mock actuarial jobs...\n`);

  const jobs = [];

  for (let i = 0; i < count; i++) {
    const title = randomItem(jobTitles);
    const company = randomItem(companies);
    const location = randomItem(cities);
    const jobType = randomItem(jobTypes);
    const isRemote = jobType === 'Remote' || jobType === 'Hybrid';

    const details = generateDescription(title, company, location);

    jobs.push({
      id: `job_${Date.now()}_${i}`,
      title: title,
      company: company,
      location: isRemote ? 'Remote' : `${location.city}, ${location.state}`,
      city: location.city,
      state: location.state,
      country: 'United States',
      salary: `$${details.salaryMin.toLocaleString()} - $${details.salaryMax.toLocaleString()}`,
      salaryMin: details.salaryMin,
      salaryMax: details.salaryMax,
      description: details.description,
      requirements: details.requirements,
      experienceLevel: details.experienceLevel,
      certification: details.certification,
      url: `https://careers.${company.toLowerCase().replace(/\s+/g, '')}.com/job/${i + 1}`,
      postedDate: randomDate(30),
      jobType: jobType,
      isRemote: isRemote,
      skills: details.requirements,
      source: 'Mock Data Generator',
      scrapedAt: new Date().toISOString()
    });
  }

  return jobs;
}

function exportToJSON(jobs, filename = 'actuarial-jobs-mock.json') {
  const outputPath = path.join(process.cwd(), 'data', filename);
  
  const dir = path.dirname(outputPath);
  if (!fs.existsSync(dir)) {
    fs.mkdirSync(dir, { recursive: true });
  }

  fs.writeFileSync(outputPath, JSON.stringify(jobs, null, 2));
  console.log(`📁 Exported ${jobs.length} jobs to ${filename}`);
}

function exportToCSV(jobs, filename = 'actuarial-jobs-mock.csv') {
  const outputPath = path.join(process.cwd(), 'data', filename);
  
  const dir = path.dirname(outputPath);
  if (!fs.existsSync(dir)) {
    fs.mkdirSync(dir, { recursive: true });
  }

  const headers = [
    'Title', 'Company', 'Location', 'Salary Min', 'Salary Max',
    'Description', 'Experience Level', 'Job Type', 'Remote', 'Skills', 'URL'
  ];

  const escapeCSV = (value) => {
    const str = String(value || '');
    if (str.includes(',') || str.includes('"') || str.includes('\n')) {
      return `"${str.replace(/"/g, '""')}"`;
    }
    return str;
  };

  const rows = jobs.map(job => [
    escapeCSV(job.title),
    escapeCSV(job.company),
    escapeCSV(job.location),
    job.salaryMin,
    job.salaryMax,
    escapeCSV(job.description.substring(0, 500)),
    escapeCSV(job.experienceLevel),
    escapeCSV(job.jobType),
    job.isRemote ? 'Yes' : 'No',
    escapeCSV(job.skills.join(', ')),
    escapeCSV(job.url)
  ]);

  const csv = [headers, ...rows].map(row => row.join(',')).join('\n');
  fs.writeFileSync(outputPath, csv);
  
  console.log(`📁 Exported ${jobs.length} jobs to ${filename}`);
}

function displaySummary(jobs) {
  console.log('\n' + '═'.repeat(60));
  console.log('📊 MOCK JOB DATA SUMMARY');
  console.log('═'.repeat(60));
  
  console.log(`\n📈 Total jobs generated: ${jobs.length}`);

  // By experience level
  const byExp = jobs.reduce((acc, job) => {
    acc[job.experienceLevel] = (acc[job.experienceLevel] || 0) + 1;
    return acc;
  }, {});

  console.log('\n📊 By Experience Level:');
  Object.entries(byExp).forEach(([level, count]) => {
    console.log(`   ${level.padEnd(20)} ${count}`);
  });

  // Remote vs On-site
  const remote = jobs.filter(j => j.isRemote).length;
  console.log(`\n🏠 Remote/Hybrid: ${remote}`);
  console.log(`🏢 On-site: ${jobs.length - remote}`);

  // Salary range
  const avgMin = jobs.reduce((sum, j) => sum + j.salaryMin, 0) / jobs.length;
  const avgMax = jobs.reduce((sum, j) => sum + j.salaryMax, 0) / jobs.length;
  
  console.log(`\n💰 Average Salary Range:`);
  console.log(`   Min: $${Math.round(avgMin).toLocaleString()}`);
  console.log(`   Max: $${Math.round(avgMax).toLocaleString()}`);

  // Top locations
  const byLocation = jobs.reduce((acc, job) => {
    acc[job.location] = (acc[job.location] || 0) + 1;
    return acc;
  }, {});

  console.log('\n📍 Top Locations:');
  Object.entries(byLocation)
    .sort(([, a], [, b]) => b - a)
    .slice(0, 5)
    .forEach(([location, count]) => {
      console.log(`   ${location.padEnd(20)} ${count}`);
    });

  console.log('\n' + '═'.repeat(60) + '\n');
}

// Main
function main() {
  console.log('🚀 Mock Actuarial Jobs Generator\n');
  console.log('📝 This generates realistic sample data for testing\n');

  const count = parseInt(process.argv[2]) || 100;
  
  const jobs = generateJobs(count);
  
  displaySummary(jobs);
  
  exportToJSON(jobs);
  exportToCSV(jobs);
  
  console.log('✅ Mock data generation completed!');
  console.log('\n💡 Files created:');
  console.log('   - data/actuarial-jobs-mock.json');
  console.log('   - data/actuarial-jobs-mock.csv\n');
  console.log('💡 To import to MongoDB:');
  console.log('   node scripts/import-jobs-to-mongodb.js\n');
}

main();