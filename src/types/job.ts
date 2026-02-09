// TypeScript types for job postings

type JobPosting = {
    id: string;        // Unique identifier for the job
    title: string;     // Title of the job
    company: string;   // Company offering the job
    location: string;  // Location of the job
    salary?: number;   // Optional salary information
    benefits?: string[]; // Optional benefits offered
    description: string; // Job description
    requirements: string[]; // List of requirements for the job
};

export type { JobPosting };