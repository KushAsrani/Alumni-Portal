export const prerender = false;

import type { APIContext } from 'astro';
import { put } from '@vercel/blob';
import { sql } from '@vercel/postgres';

const RESUME_API_URL = import.meta.env.RESUME_API_URL || process.env.RESUME_API_URL || 'http://localhost:5001';

export async function POST({ request }: APIContext) {
  try {
    const formData = await request.formData();
    const file = formData.get('document') as File;
    const email = formData.get('email') as string;

    if (!file) {
      return new Response(
        JSON.stringify({ success: false, message: 'No file provided' }),
        { status: 400, headers: { 'Content-Type': 'application/json' } }
      );
    }

    if (!email) {
      return new Response(
        JSON.stringify({ success: false, message: 'Email is required' }),
        { status: 400, headers: { 'Content-Type': 'application/json' } }
      );
    }

    // Validate file type (PDF and DOCX only)
    const allowedTypes = [
      'application/pdf',
      'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
      'application/msword',
    ];

    if (!allowedTypes.includes(file.type)) {
      return new Response(
        JSON.stringify({
          success: false,
          message: 'Invalid file type. Only PDF and DOCX files are allowed.',
        }),
        { status: 400, headers: { 'Content-Type': 'application/json' } }
      );
    }

    // Validate file size (max 10MB)
    const maxSize = 10 * 1024 * 1024;
    if (file.size > maxSize) {
      return new Response(
        JSON.stringify({ success: false, message: 'File size too large. Maximum size is 10MB.' }),
        { status: 400, headers: { 'Content-Type': 'application/json' } }
      );
    }

    // Generate unique filename and upload to Vercel Blob
    const timestamp = Date.now();
    const randomString = Math.random().toString(36).substring(7);
    const extension = file.name.split('.').pop();
    const blobPath = `resumes/${timestamp}-${randomString}.${extension}`;

    const blob = await put(blobPath, file, {
      access: 'public',
      token: import.meta.env.BLOB_READ_WRITE_TOKEN || process.env.BLOB_READ_WRITE_TOKEN,
    });

    // Call Python Flask microservice
    let analysisResult: Record<string, unknown>;
    try {
      const pythonResponse = await fetch(`${RESUME_API_URL}/api/resume/analyze`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          resume_url: blob.url,
          email: email,
          file_name: file.name,
        }),
      });

      if (!pythonResponse.ok) {
        const errText = await pythonResponse.text();
        throw new Error(`Python service returned ${pythonResponse.status}: ${errText}`);
      }

      analysisResult = await pythonResponse.json() as Record<string, unknown>;
    } catch (fetchError) {
      return new Response(
        JSON.stringify({
          success: false,
          message: 'Resume analysis service is unavailable. Please try again later.',
          error: fetchError instanceof Error ? fetchError.message : 'Unknown error',
        }),
        { status: 503, headers: { 'Content-Type': 'application/json' } }
      );
    }

    // Persist result to Postgres
    try {
      const ats = analysisResult.ats as Record<string, unknown> | undefined;
      const atsScore = ats ? (ats.score as number) : null;
      const overallMatchScore = (analysisResult.overall_match_score as number) ?? null;
      const improvements = analysisResult.improvements ?? null;
      const jobMatches = analysisResult.job_matches ?? null;
      const missingKeywords: string[] =
        (improvements as Record<string, unknown> | null)?.missing_keywords as string[] ?? [];

      await sql`
        INSERT INTO resume_analyses
          (alumni_email, file_name, file_url, ats_score, match_score, missing_keywords, improvements, top_job_matches, created_at)
        VALUES
          (${email}, ${file.name}, ${blob.url}, ${atsScore}, ${overallMatchScore},
           ${missingKeywords as unknown as string}, ${JSON.stringify(improvements)}, ${JSON.stringify(jobMatches)}, NOW())
      `;
    } catch (_dbError) {
      // DB write failure is non-fatal — still return the analysis
      console.error('Failed to save resume analysis to DB:', _dbError);
    }

    return new Response(
      JSON.stringify({ ...analysisResult, file_url: blob.url }),
      { status: 200, headers: { 'Content-Type': 'application/json' } }
    );

  } catch (error) {
    console.error('Resume analyze error:', error);
    return new Response(
      JSON.stringify({
        success: false,
        message: 'An unexpected error occurred during analysis.',
        error: error instanceof Error ? error.message : 'Unknown error',
      }),
      { status: 500, headers: { 'Content-Type': 'application/json' } }
    );
  }
}
