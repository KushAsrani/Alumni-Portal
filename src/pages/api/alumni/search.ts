export const prerender = false;

import type { APIRoute } from 'astro';
import { connectToDatabase } from '../../../lib/mongodb';
import { getSiteConfig } from '../../../utils/config';

interface SearchParams {
  q: string;
  faculty: string[];
  year: string[];
  skills: string[];
  location: string[];
  company: string[];
  availability: string[];
  page: number;
  limit: number;
  sort: 'name' | 'year' | 'faculty';
}

const ALLOWED_SORTS = new Set(['name', 'year', 'faculty']);
const AVAILABILITY_FIELD_MAP: Record<string, string> = {
  mentorship: 'open_to_mentorship',
  open_to_work: 'open_to_work',
  open_to_referral: 'open_to_referral',
};

const escapeRegex = (value: string) => value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
const generateSlug = (name: string) =>
  (name || '')
    .toLowerCase()
    .replace(/[^a-z0-9\s-]/g, '')
    .trim()
    .replace(/\s+/g, '-');

function parseCsvParam(params: URLSearchParams, key: string) {
  const value = params.get(key);
  if (!value) return [];
  return value
    .split(',')
    .map((item) => item.trim())
    .filter(Boolean);
}

function toSearchParams(params: URLSearchParams): SearchParams {
  const config = getSiteConfig();
  const pageParam = parseInt(params.get('page') || '1', 10);
  const limitParam = parseInt(params.get('limit') || String(config.content?.alumni_per_page || 12), 10);
  const sortParam = params.get('sort') || 'name';

  return {
    q: (params.get('q') || '').trim(),
    faculty: parseCsvParam(params, 'faculty'),
    year: parseCsvParam(params, 'year'),
    skills: parseCsvParam(params, 'skills'),
    location: parseCsvParam(params, 'location'),
    company: parseCsvParam(params, 'company'),
    availability: parseCsvParam(params, 'availability').filter((item) => item in AVAILABILITY_FIELD_MAP),
    page: Number.isNaN(pageParam) || pageParam < 1 ? 1 : pageParam,
    limit: Number.isNaN(limitParam) || limitParam < 1 ? config.content?.alumni_per_page || 12 : limitParam,
    sort: ALLOWED_SORTS.has(sortParam) ? (sortParam as SearchParams['sort']) : 'name',
  };
}

function buildQuery(params: SearchParams, useRegexForSearch: boolean) {
  const andConditions: Record<string, any>[] = [{ status: 'approved' }];

  if (params.q) {
    if (useRegexForSearch) {
      const searchRegex = new RegExp(escapeRegex(params.q), 'i');
      andConditions.push({
        $or: [
          { name: searchRegex },
          { faculty: searchRegex },
          { short_bio: searchRegex },
          { skills: searchRegex },
          { company: searchRegex },
          { location: searchRegex },
        ],
      });
    } else {
      andConditions.push({ $text: { $search: params.q } });
    }
  }

  if (params.faculty.length) {
    andConditions.push({ faculty: { $in: params.faculty } });
  }

  if (params.year.length) {
    const yearValues = new Set<any>();
    params.year.forEach((value) => {
      yearValues.add(value);
      const parsedNumber = Number(value);
      if (!Number.isNaN(parsedNumber)) {
        yearValues.add(parsedNumber);
      }
    });
    andConditions.push({ year: { $in: [...yearValues] } });
  }

  if (params.skills.length) {
    const skillRegexConditions = params.skills.map((skill) => ({
      skills: { $regex: new RegExp(`(^|,\\s*)${escapeRegex(skill)}(,|$)`, 'i') },
    }));

    andConditions.push({
      $or: [{ skills: { $in: params.skills } }, ...skillRegexConditions],
    });
  }

  if (params.location.length) {
    andConditions.push({ location: { $in: params.location } });
  }

  if (params.company.length) {
    andConditions.push({ company: { $in: params.company } });
  }

  if (params.availability.length) {
    andConditions.push({
      $or: params.availability.map((key) => ({ [AVAILABILITY_FIELD_MAP[key]]: true })),
    });
  }

  return andConditions.length === 1 ? andConditions[0] : { $and: andConditions };
}

function getSortSpec(sort: SearchParams['sort']) {
  if (sort === 'year') return { year: -1, name: 1 };
  if (sort === 'faculty') return { faculty: 1, name: 1 };
  return { name: 1 };
}

function buildFacetPipeline(query: Record<string, any>) {
  return [
    { $match: query },
    {
      $facet: {
        faculties: [
          { $match: { faculty: { $type: 'string', $ne: '' } } },
          { $group: { _id: '$faculty', count: { $sum: 1 } } },
          { $sort: { count: -1, _id: 1 } },
        ],
        years: [
          { $match: { year: { $exists: true, $ne: null } } },
          { $group: { _id: '$year', count: { $sum: 1 } } },
          { $sort: { count: -1, _id: -1 } },
        ],
        locations: [
          { $match: { location: { $type: 'string', $ne: '' } } },
          { $group: { _id: '$location', count: { $sum: 1 } } },
          { $sort: { count: -1, _id: 1 } },
        ],
        companies: [
          { $match: { company: { $type: 'string', $ne: '' } } },
          { $group: { _id: '$company', count: { $sum: 1 } } },
          { $sort: { count: -1, _id: 1 } },
        ],
        skills: [
          {
            $project: {
              normalizedSkills: {
                $cond: [
                  { $isArray: '$skills' },
                  '$skills',
                  {
                    $cond: [
                      { $and: [{ $ne: ['$skills', null] }, { $ne: ['$skills', ''] }] },
                      {
                        $map: {
                          input: { $split: ['$skills', ','] },
                          as: 'skill',
                          in: { $trim: { input: '$$skill' } },
                        },
                      },
                      [],
                    ],
                  },
                ],
              },
            },
          },
          { $unwind: '$normalizedSkills' },
          { $match: { normalizedSkills: { $ne: '' } } },
          { $group: { _id: '$normalizedSkills', count: { $sum: 1 } } },
          { $sort: { count: -1, _id: 1 } },
          { $limit: 200 },
        ],
      },
    },
  ];
}

function normalizeFacetOutput(facets: any = {}) {
  const mapFacet = (items: any[] = []) =>
    items
      .filter((item) => item?._id !== undefined && item?._id !== null && item?._id !== '')
      .map((item) => ({ value: item._id, count: item.count || 0 }));

  return {
    faculties: mapFacet(facets.faculties),
    skills: mapFacet(facets.skills),
    locations: mapFacet(facets.locations),
    companies: mapFacet(facets.companies),
    years: mapFacet(facets.years),
  };
}

// Recommended text index setup (run once in MongoDB):
// db.collection('alumni_registrations').createIndex({ name: 'text', short_bio: 'text', skills: 'text', company: 'text', location: 'text' })
export const GET: APIRoute = async ({ url }) => {
  const params = toSearchParams(url.searchParams);

  try {
    const { db } = await connectToDatabase();
    const collection = db.collection('alumni_registrations');

    const runSearch = async (useRegexForSearch: boolean) => {
      const query = buildQuery(params, useRegexForSearch);
      const total = await collection.countDocuments(query);
      const totalPages = Math.max(1, Math.ceil(total / params.limit));
      const page = Math.min(params.page, totalPages);
      const skip = (page - 1) * params.limit;

      const alumniDocs = await collection
        .find(query)
        .sort(getSortSpec(params.sort))
        .skip(skip)
        .limit(params.limit)
        .toArray();

      const [facetData] = await collection.aggregate(buildFacetPipeline(query)).toArray();

      return {
        alumni: alumniDocs.map((alum: any) => ({
          ...alum,
          slug: alum.slug || generateSlug(alum.name || ''),
          _id: alum._id?.toString?.(),
        })),
        total,
        page,
        totalPages,
        facets: normalizeFacetOutput(facetData),
      };
    };

    try {
      const data = await runSearch(false);
      return new Response(JSON.stringify(data), {
        status: 200,
        headers: { 'Content-Type': 'application/json' },
      });
    } catch (textSearchError: any) {
      const message = textSearchError?.message || '';
      const noTextIndex = /text index required|text index/i.test(message);
      if (!noTextIndex) throw textSearchError;

      const data = await runSearch(true);
      return new Response(JSON.stringify(data), {
        status: 200,
        headers: { 'Content-Type': 'application/json' },
      });
    }
  } catch (error) {
    console.error('Error searching alumni:', error);
    return new Response(
      JSON.stringify({
        success: false,
        message: 'Failed to search alumni',
        error: error instanceof Error ? error.message : 'Unknown error',
      }),
      {
        status: 500,
        headers: { 'Content-Type': 'application/json' },
      }
    );
  }
};
