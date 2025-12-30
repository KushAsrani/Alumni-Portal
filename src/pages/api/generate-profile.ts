export const prerender = false;

import type { APIContext } from 'astro';
import { connectToDatabase } from '../../lib/mongodb';
import { ObjectId } from 'mongodb';
import fs from 'fs';
import path from 'path';

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

    // Connect to MongoDB
    const { db } = await connectToDatabase();
    const collection = db.collection('alumni_registrations');

    // Find the registration
    const registration = await collection.findOne({ _id: new ObjectId(id) });

    if (!registration) {
      return new Response(
        JSON.stringify({ success: false, message: 'Registration not found' }),
        { status: 404, headers: { 'Content-Type': 'application/json' } }
      );
    }

    // Generate slug from name
    const slug = registration.name
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, '-')
      .replace(/(^-|-$)/g, '');

    // Helper function to format YAML values
    function formatYaml(value: any): string {
      if (value === null || value === undefined) return '';
      const str = String(value);
      const cleaned = str.replace(/^["']|["']$/g, '');
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
    
    // Format social section
    let socialSection = '';
    if (Object.keys(socialObj).length > 0) {
      socialSection = 'social:\n';
      if (socialObj.portfolio) socialSection += `  portfolio: "${socialObj.portfolio}"\n`;
      if (socialObj.linkedin) socialSection += `  linkedin: "${socialObj.linkedin}"\n`;
      if (socialObj.twitter) socialSection += `  twitter: "${socialObj.twitter}"\n`;
      if (socialObj.github) socialSection += `  github: "${socialObj.github}"\n`;
    }

    // Parse arrays
    const skillsArray = registration.skills 
      ? registration.skills.split(',').map((s: string) => s.trim()).filter((s: string) => s)
      : [];
    
    const interestsArray = registration.interests 
      ? registration.interests.split(',').map((i: string) => i.trim()).filter((i: string) => i)
      : [];

    const projectsArray = registration.projects 
      ? registration.projects.split('\n').filter((p: string) => p.trim()).map((p: string) => ({
          name: p.trim(),
          description: ''
        }))
      : [];

    // Generate YAML content
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
  - degree: "${formatYaml(registration.degree && registration.faculty ? `${registration.degree} ${registration.faculty}` : 'N/A')}"
    institution: "${formatYaml(registration.university || '')}"
    year: ${registration.year || 'null'}
    gpa: "${formatYaml(registration.gpa || '')}"
achievements: []
interests: ${JSON.stringify(interestsArray)}
${socialSection}`.trim() + '\n';

    // Save to file
    const alumniDir = path.join(process.cwd(), 'src', 'content', 'alumni');
    
    if (!fs.existsSync(alumniDir)) {
      fs.mkdirSync(alumniDir, { recursive: true });
    }

    const fileName = `${slug}.yaml`;
    const filePath = path.join(alumniDir, fileName);

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