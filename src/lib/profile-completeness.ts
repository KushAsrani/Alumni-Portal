import type { AlumniRegistration } from './mongodb';

export interface CompletenessSection {
  name: string;
  score: number;
  fields: { label: string; filled: boolean; key: string }[];
}

export interface CompletenessResult {
  score: number;
  filled: string[];
  missing: string[];
  sections: CompletenessSection[];
}

type FieldConfig = {
  key: keyof AlumniRegistration;
  label: string;
  weight: number;
  section: 'Personal' | 'Education' | 'Professional' | 'Contact & Social';
};

const FIELD_CONFIG: FieldConfig[] = [
  { key: 'name', label: 'Full Name', weight: 5, section: 'Personal' },
  { key: 'email', label: 'Email Address', weight: 5, section: 'Personal' },
  { key: 'photo_blob_url', label: 'Profile Photo', weight: 5, section: 'Personal' },
  { key: 'short_bio', label: 'Short Bio', weight: 5, section: 'Personal' },
  { key: 'year', label: 'Graduation Year', weight: 5, section: 'Education' },
  { key: 'faculty', label: 'Faculty', weight: 5, section: 'Education' },
  { key: 'degree', label: 'Degree', weight: 5, section: 'Education' },
  { key: 'university', label: 'University', weight: 5, section: 'Education' },
  { key: 'company', label: 'Current Company', weight: 10, section: 'Professional' },
  { key: 'job_designation', label: 'Job Title', weight: 10, section: 'Professional' },
  { key: 'location', label: 'Location', weight: 5, section: 'Professional' },
  { key: 'skills', label: 'Skills', weight: 10, section: 'Professional' },
  { key: 'linkedin', label: 'LinkedIn Profile', weight: 10, section: 'Contact & Social' },
  { key: 'mobile', label: 'Mobile Number', weight: 5, section: 'Contact & Social' },
  { key: 'github', label: 'GitHub Profile', weight: 5, section: 'Contact & Social' },
  { key: 'portfolio', label: 'Portfolio Website', weight: 5, section: 'Contact & Social' },
];

function isFilledValue(value: unknown): boolean {
  if (Array.isArray(value)) {
    return value.length > 0;
  }

  if (typeof value === 'string') {
    return value.trim().length > 0;
  }

  return Boolean(value);
}

export function calculateCompleteness(alumni: Partial<AlumniRegistration>): CompletenessResult {
  const filled: string[] = [];
  const missing: string[] = [];

  const sections = ['Personal', 'Education', 'Professional', 'Contact & Social'].map((sectionName) => {
    const sectionFields = FIELD_CONFIG.filter((field) => field.section === sectionName);
    const sectionWeight = sectionFields.reduce((sum, field) => sum + field.weight, 0);
    let filledWeight = 0;

    const fields = sectionFields.map((field) => {
      const value = alumni[field.key];
      const fieldFilled = isFilledValue(value);

      if (fieldFilled) {
        filled.push(field.label);
        filledWeight += field.weight;
      } else {
        missing.push(field.label);
      }

      return {
        label: field.label,
        filled: fieldFilled,
        key: String(field.key),
      };
    });

    return {
      name: sectionName,
      score: sectionWeight > 0 ? Math.round((filledWeight / sectionWeight) * 100) : 0,
      fields,
    } satisfies CompletenessSection;
  });

  const score = FIELD_CONFIG.reduce((sum, field) => {
    return sum + (isFilledValue(alumni[field.key]) ? field.weight : 0);
  }, 0);

  return {
    score,
    filled,
    missing,
    sections,
  };
}
