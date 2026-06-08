type AlumniRecord = {
  name?: string;
  email?: string;
  faculty?: string;
  year?: string | number;
  location?: string;
  company?: string;
  position?: string;
  job_designation?: string;
  skills?: string[] | string;
  linkedin?: string;
};

const escapeCsv = (value: unknown) => {
  const text = String(value ?? '');
  return `"${text.replace(/"/g, '""')}"`;
};

const normalizeSkills = (skills: AlumniRecord['skills']) => {
  if (Array.isArray(skills)) return skills.join(', ');
  if (typeof skills === 'string') return skills;
  return '';
};

export const exportAlumniToCsv = (rows: AlumniRecord[]) => {
  const headers = ['Name', 'Email', 'Faculty', 'Year', 'Location', 'Company', 'Position', 'Skills', 'LinkedIn'];
  const csvRows = rows.map((row) =>
    [
      row.name,
      row.email,
      row.faculty,
      row.year,
      row.location,
      row.company,
      row.position || row.job_designation,
      normalizeSkills(row.skills),
      row.linkedin,
    ]
      .map(escapeCsv)
      .join(',')
  );

  const csv = [headers.join(','), ...csvRows].join('\n');
  const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' });
  const link = document.createElement('a');
  const url = URL.createObjectURL(blob);
  const date = new Date().toISOString().slice(0, 10);

  link.href = url;
  link.download = `alumni-export-${date}.csv`;
  document.body.appendChild(link);
  link.click();
  document.body.removeChild(link);
  URL.revokeObjectURL(url);
};
