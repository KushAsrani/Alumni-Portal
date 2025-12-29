export const prerender = false;

import type { APIContext } from 'astro';
import pg from 'pg';
import fs from 'fs';
import path from 'path';
const { Client } = pg;

export async function POST({ request }: APIContext) {
  try {
    const authHeader = request.headers.get('Authorization');
    const expectedAuth = `Bearer ${import.meta.env.ADMIN_API_KEY || process.env.ADMIN_API_KEY}`;
    
    if (!authHeader || authHeader !== expectedAuth) {
      return new Response(
        JSON.stringify({ success: false, message: 'Unauthorized' }),
        { status: 401, headers: { 'Content-Type': 'application/json' } }
      );
    }

    const body = await request.json();
    const { id } = body;

    if (!id) {
      return new Response(
        JSON.stringify({ success: false, message: 'Registration ID is required' }),
        { status: 400, headers: { 'Content-Type': 'application/json' } }
      );
    }

    const connectionString = 
      import.meta.env.POSTGRES_URL_NON_POOLING || 
      import.meta.env.POSTGRES_PRISMA_URL || 
      import.meta.env.POSTGRES_URL ||
      import.meta.env.DATABASE_URL ||
      process.env.POSTGRES_URL_NON_POOLING || 
      process.env.POSTGRES_PRISMA_URL || 
      process.env.POSTGRES_URL ||
      process.env.DATABASE_URL;

    if (!connectionString) {
      return new Response(
        JSON.stringify({ success: false, message: 'Database configuration error' }),
        { status: 500, headers: { 'Content-Type': 'application/json' } }
      );
    }

    const client = new Client({
      connectionString: connectionString,
      ssl: { rejectUnauthorized: false }
    });

    await client.connect();

    const result = await client.query(
      'SELECT * FROM alumni_registrations WHERE id = $1',
      [id]
    );

    await client.end();

    if (result.rows.length === 0) {
      return new Response(
        JSON.stringify({ success: false, message: 'Registration not found' }),
        { status: 404, headers: { 'Content-Type': 'application/json' } }
      );
    }

    const registration = result.rows[0];

    // Generate slug from name
    const slug = registration.name
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, '-')
      .replace(/(^-|-$)/g, '');

    // Helper function to format YAML values (escape quotes and handle special characters)
    function formatYaml(value: any): string {
      if (value === null || value === undefined) return '';
      const str = String(value);
      // Remove any existing quotes first
      const cleaned = str.replace(/^["']|["']$/g, '');
      // Escape internal quotes
      return cleaned.replace(/"/g, '\\"');
    }

    // Helper function to build social object with only valid URLs
    const buildSocialObject = () => {
      const social: any = {};
      
      if (registration.linkedin && registration.linkedin.trim()) {
        social.linkedin = formatYaml(registration.linkedin);
      }
      if (registration.twitter && registration.twitter.trim()) {
        social.twitter = formatYaml(registration.twitter);
      }
      if (registration.github && registration.github.trim()) {
        social.github = formatYaml(registration.github);
      }
      if (registration.portfolio && registration.portfolio.trim()) {
        social.portfolio = formatYaml(registration.portfolio);
      }
      
      return social;
    };

    const socialObj = buildSocialObject();
    
    // Format social section - only include fields that have values
    let socialSection = '';
    if (Object.keys(socialObj).length > 0) {
      socialSection = 'social:\n';
      if (socialObj.portfolio) socialSection += `  portfolio: "${socialObj.portfolio}"\n`;
      if (socialObj.linkedin) socialSection += `  linkedin: "${socialObj.linkedin}"\n`;
      if (socialObj.twitter) socialSection += `  twitter: "${socialObj.twitter}"\n`;
      if (socialObj.github) socialSection += `  github: "${socialObj.github}"\n`;
    }

    // Parse skills and interests arrays, filtering out empty values
    const skillsArray = registration.skills 
      ? registration.skills.split(',').map((s: string) => s.trim()).filter((s: string) => s)
      : [];
    
    const interestsArray = registration.interests 
      ? registration.interests.split(',').map((i: string) => i.trim()).filter((i: string) => i)
      : [];

    // Parse projects from text (each line is a project)
    // Only include url field if it's a valid URL, otherwise omit it
    const projectsArray = registration.projects 
      ? registration.projects.split('\n').filter((p: string) => p.trim()).map((p: string) => {
          const project: any = {
            name: p.trim(),
            description: ''
          };
          // Only add url if we have a valid one (for future use)
          // For now, omit it entirely to match schema
          return project;
        })
      : [];

    // Generate YAML content - properly handle optional fields
    const yamlContent = `name: "${formatYaml(registration.name)}"
slug: "${slug}"
faculty: "${formatYaml(registration.faculty || 'N/A')}"
year: ${registration.year || 'null'}
short_bio: "${formatYaml(registration.short_bio || '')}"
long_bio: "${formatYaml(registration.short_bio || '')}"
photo: "${registration.photo_blob_url || '/images/avatars/default-avatar.svg'}"
email: "${registration.email}"
mobile: "${formatYaml(registration.mobile || '')}"
location: "${formatYaml(registration.location || '')}"
company: "${formatYaml(registration.company || '')}"
position: "${formatYaml(registration.job_designation || '')}"
skills: ${JSON.stringify(skillsArray)}
projects: ${JSON.stringify(projectsArray)}
work_experience:
  - company: "${formatYaml(registration.company || 'N/A')}"
    position: "${formatYaml(registration.job_designation || 'N/A')}"
    duration: "${registration.year || ''} - Present"
    description: "${formatYaml(registration.work_experience || '')}"
education:
  - degree: "${formatYaml(registration.degree && registration.faculty ? `${registration.degree} ${registration.faculty}` : (registration.degree || 'N/A'))}"
    institution: "${formatYaml(registration.university || '')}"
    year: ${registration.year || 'null'}
    gpa: "${formatYaml(registration.gpa || '')}"
achievements: []
interests: ${JSON.stringify(interestsArray)}
${socialSection}`.trim() + '\n';

    // Save to file
    const alumniDir = path.join(process.cwd(), 'src', 'content', 'alumni');
    
    // Ensure directory exists
    if (!fs.existsSync(alumniDir)) {
      fs.mkdirSync(alumniDir, { recursive: true });
    }

    const fileName = `${slug}.yaml`;
    const filePath = path.join(alumniDir, fileName);

    // Check if file already exists
    if (fs.existsSync(filePath)) {
      return new Response(
        JSON.stringify({
          success: false,
          message: 'Profile already exists for this alumni'
        }),
        { status: 409, headers: { 'Content-Type': 'application/json' } }
      );
    }

    fs.writeFileSync(filePath, yamlContent, 'utf8');

    return new Response(
      JSON.stringify({
        success: true,
        message: 'Alumni profile generated successfully',
        data: {
          fileName: fileName,
          slug: slug,
          path: `/alumni/profiles/${slug}`
        }
      }),
      { status: 200, headers: { 'Content-Type': 'application/json' } }
    );

  } catch (error) {
    console.error('Profile generation error:', error);
    
    return new Response(
      JSON.stringify({
        success: false,
        message: 'An error occurred while generating profile',
        error: error instanceof Error ? error.message : 'Unknown error'
      }),
      { status: 500, headers: { 'Content-Type': 'application/json' } }
    );
  }
}