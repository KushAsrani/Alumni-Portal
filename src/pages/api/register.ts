export const prerender = false;

import type { APIContext } from 'astro';
import { connectToDatabase, type AlumniRegistration } from '../../lib/mongodb';

export async function POST({ request }: APIContext) {
  try {
    const clonedRequest = request.clone();
    let bodyText = '';
    
    try {
      bodyText = await clonedRequest.text();
    } catch (e) {
      console.error('Failed to read body:', e);
    }
    
    if (!bodyText) {
      return new Response(
        JSON.stringify({
          success: false,
          message: 'Empty request body'
        }),
        { status: 400, headers: { 'Content-Type': 'application/json' } }
      );
    }
    
    let body;
    try {
      body = JSON.parse(bodyText);
    } catch (e) {
      console.error('JSON parse error:', e);
      return new Response(
        JSON.stringify({
          success: false,
          message: 'Invalid JSON format'
        }),
        { status: 400, headers: { 'Content-Type': 'application/json' } }
      );
    }

    const { 
      name, 
      email, 
      mobile,
      dob,
      gender,
      address,
      year, 
      faculty, 
      degree,
      university,
      college_name,
      gpa,
      job_designation,
      company,
      location,
      linkedin,
      github,
      twitter,
      portfolio,
      photo_blob_url,
      degree_certificate_url,
      skills,
      projects,
      work_experience,
      interests,
      short_bio 
    } = body;

    // Validate required fields
    if (!name || !email) {
      return new Response(
        JSON.stringify({
          success: false,
          message: 'Name and email are required'
        }),
        { status: 400, headers: { 'Content-Type': 'application/json' } }
      );
    }

    // Validate email format
    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
    if (!emailRegex.test(email)) {
      return new Response(
        JSON.stringify({
          success: false,
          message: 'Invalid email format'
        }),
        { status: 400, headers: { 'Content-Type': 'application/json' } }
      );
    }

    // Validate mobile number if provided
    if (mobile) {
      const mobileRegex = /^[+]?[\d\s\-()]{10,}$/;
      if (!mobileRegex.test(mobile)) {
        return new Response(
          JSON.stringify({
            success: false,
            message: 'Invalid mobile number format'
          }),
          { status: 400, headers: { 'Content-Type': 'application/json' } }
        );
      }
    }

    // Connect to MongoDB
    const { db } = await connectToDatabase();
    const collection = db.collection<AlumniRegistration>('alumni_registrations');

    // Check if email already exists
    const existingUser = await collection.findOne({ email });

    if (existingUser) {
      return new Response(
        JSON.stringify({
          success: false,
          message: 'Name or email is already registered. Please use a different name or email.'
        }),
        { status: 409, headers: { 'Content-Type': 'application/json' } }
      );
    }

    // Create new registration document
    const newRegistration: AlumniRegistration = {
      name,
      email,
      mobile: mobile || undefined,
      dob: dob || undefined,
      gender: gender || undefined,
      address: address || undefined,
      year: year || undefined,
      faculty: faculty || undefined,
      degree: degree || undefined,
      university: university || undefined,
      college_name: college_name || undefined,
      gpa: gpa || undefined,
      job_designation: job_designation || undefined,
      company: company || undefined,
      location: location || undefined,
      linkedin: linkedin || undefined,
      github: github || undefined,
      twitter: twitter || undefined,
      portfolio: portfolio || undefined,
      photo_blob_url: photo_blob_url || undefined,
      degree_certificate_url: degree_certificate_url || undefined,
      skills: skills || undefined,
      projects: projects || undefined,
      work_experience: work_experience || undefined,
      interests: interests || undefined,
      short_bio: short_bio || undefined,
      status: 'pending',
      created_at: new Date(),
      updated_at: new Date()
    };

    // Insert document
    const result = await collection.insertOne(newRegistration as any);

    return new Response(
      JSON.stringify({
        success: true,
        message: 'Registration submitted successfully',
        data: {
          id: result.insertedId,
          name,
          email,
          created_at: newRegistration.created_at
        }
      }),
      { status: 201, headers: { 'Content-Type': 'application/json' } }
    );

  } catch (error) {
    console.error('Registration error:', error);
    
    return new Response(
      JSON.stringify({
        success: false,
        message: 'An error occurred while processing your registration',
        error: error instanceof Error ? error.message : 'Unknown error'
      }),
      { status: 500, headers: { 'Content-Type': 'application/json' } }
    );
  }
}

export async function GET({ request }: APIContext) {
  try {
    const authHeader = request.headers.get('Authorization');
    const expectedAuth = `Bearer ${import.meta.env.ADMIN_API_KEY || process.env.ADMIN_API_KEY}`;
    
    if (!authHeader || authHeader !== expectedAuth) {
      return new Response(
        JSON.stringify({ success: false, message: 'Unauthorized' }),
        { status: 401, headers: { 'Content-Type': 'application/json' } }
      );
    }

    // Connect to MongoDB
    const { db } = await connectToDatabase();
    const collection = db.collection<AlumniRegistration>('alumni_registrations');

    // Get all registrations, sorted by created_at descending
    const registrations = await collection
      .find({})
      .sort({ created_at: -1 })
      .toArray();

    // Convert MongoDB _id to id for frontend compatibility
    const formattedRegistrations = registrations.map(reg => ({
      ...reg,
      id: reg._id?.toString(),
      _id: undefined
    }));

    return new Response(
      JSON.stringify({
        success: true,
        data: formattedRegistrations
      }),
      { status: 200, headers: { 'Content-Type': 'application/json' } }
    );

  } catch (error) {
    console.error('Fetch registrations error:', error);
    
    return new Response(
      JSON.stringify({
        success: false,
        message: 'An error occurred while fetching registrations'
      }),
      { status: 500, headers: { 'Content-Type': 'application/json' } }
    );
  }
}