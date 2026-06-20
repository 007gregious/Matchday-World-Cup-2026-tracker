/**
 * Flags as emoji — zero bytes over the network, crisp at any size, and
 * themeable for free (they inherit the surrounding text color in most
 * "flat" emoji sets, but even where they don't, they're tiny).
 *
 * football-data.org sometimes uses FIFA's official name and sometimes a
 * shorter common name (e.g. "Korea Republic" vs "South Korea", "Côte
 * d'Ivoire" vs "Ivory Coast"), so this table includes common aliases for
 * every entry that has one. The list deliberately covers far more than the
 * 48 World Cup 2026 teams, so the same file keeps working if you point this
 * app at the Euros, Copa América, AFCON, or any other competition later.
 *
 * Lookups are normalised (accents stripped, lowercased, punctuation
 * removed) so "Côte d'Ivoire", "Cote d'Ivoire" and "côte d’ivoire" all
 * resolve to the same entry.
 */

// Regional-indicator flags are built from a 2-letter ISO code.
function isoToFlag(iso2) {
  const chars = iso2
    .toUpperCase()
    .split('')
    .map((c) => 0x1f1e6 + (c.charCodeAt(0) - 65));
  return String.fromCodePoint(...chars);
}

// England / Scotland / Wales don't have ISO country codes — they use the
// Unicode "tag sequence" subdivision flags instead (built from U+1F3F4 +
// tag characters spelling "gbeng" / "gbsct" / "gbwls" + a cancel tag).
function tagFlag(subdivision) {
  const BASE = 0x1f3f4;
  const TAG_BASE = 0xe0000;
  const CANCEL = 0xe007f;
  const codes = [BASE, ...subdivision.split('').map((c) => TAG_BASE + c.charCodeAt(0)), CANCEL];
  return String.fromCodePoint(...codes);
}

const ENGLAND = tagFlag('gbeng');
const SCOTLAND = tagFlag('gbsct');
const WALES = tagFlag('gbwls');

// name (normalised) -> ISO 3166-1 alpha-2, OR a literal flag string for the
// home nations above.
const NAME_TO_FLAG = {
  // ── Host nations / CONCACAF ──────────────────────────────────────────
  'canada': 'CA',
  'mexico': 'MX',
  'usa': 'US',
  'united states': 'US',
  'united states of america': 'US',
  'costa rica': 'CR',
  'curacao': 'CW',
  'honduras': 'HN',
  'jamaica': 'JM',
  'panama': 'PA',
  'haiti': 'HT',
  'el salvador': 'SV',
  'guatemala': 'GT',
  'trinidad and tobago': 'TT',
  'suriname': 'SR',
  'nicaragua': 'NI',
  'cuba': 'CU',
  'dominican republic': 'DO',

  // ── South America (CONMEBOL) ─────────────────────────────────────────
  'argentina': 'AR',
  'brazil': 'BR',
  'uruguay': 'UY',
  'colombia': 'CO',
  'ecuador': 'EC',
  'paraguay': 'PY',
  'chile': 'CL',
  'peru': 'PE',
  'bolivia': 'BO',
  'venezuela': 'VE',

  // ── Europe (UEFA) ─────────────────────────────────────────────────────
  'france': 'FR',
  'germany': 'DE',
  'spain': 'ES',
  'portugal': 'PT',
  'netherlands': 'NL',
  'holland': 'NL',
  'belgium': 'BE',
  'england': ENGLAND,
  'scotland': SCOTLAND,
  'wales': WALES,
  'northern ireland': 'GB',
  'republic of ireland': 'IE',
  'ireland': 'IE',
  'italy': 'IT',
  'switzerland': 'CH',
  'austria': 'AT',
  'croatia': 'HR',
  'serbia': 'RS',
  'poland': 'PL',
  'ukraine': 'UA',
  'denmark': 'DK',
  'sweden': 'SE',
  'norway': 'NO',
  'finland': 'FI',
  'iceland': 'IS',
  'czechia': 'CZ',
  'czech republic': 'CZ',
  'slovakia': 'SK',
  'slovenia': 'SI',
  'hungary': 'HU',
  'romania': 'RO',
  'bulgaria': 'BG',
  'greece': 'GR',
  'turkey': 'TR',
  'turkiye': 'TR',
  'bosnia and herzegovina': 'BA',
  'albania': 'AL',
  'north macedonia': 'MK',
  'macedonia': 'MK',
  'montenegro': 'ME',
  'kosovo': 'XK',
  'georgia': 'GE',
  'armenia': 'AM',
  'azerbaijan': 'AZ',
  'belarus': 'BY',
  'russia': 'RU',
  'israel': 'IL',
  'cyprus': 'CY',
  'luxembourg': 'LU',
  'malta': 'MT',
  'moldova': 'MD',
  'estonia': 'EE',
  'latvia': 'LV',
  'lithuania': 'LT',
  'kazakhstan': 'KZ',

  // ── Africa (CAF) ──────────────────────────────────────────────────────
  'morocco': 'MA',
  'senegal': 'SN',
  'tunisia': 'TN',
  'egypt': 'EG',
  'algeria': 'DZ',
  'nigeria': 'NG',
  'ghana': 'GH',
  'cameroon': 'CM',
  'ivory coast': 'CI',
  'cote divoire': 'CI',
  'south africa': 'ZA',
  'dr congo': 'CD',
  'congo dr': 'CD',
  'democratic republic of the congo': 'CD',
  'congo': 'CG',
  'cape verde': 'CV',
  'cabo verde': 'CV',
  'mali': 'ML',
  'burkina faso': 'BF',
  'guinea': 'GN',
  'gabon': 'GA',
  'zambia': 'ZM',
  'mozambique': 'MZ',
  'angola': 'AO',
  'tanzania': 'TZ',
  'uganda': 'UG',
  'kenya': 'KE',
  'benin': 'BJ',
  'sierra leone': 'SL',
  'guinea bissau': 'GW',
  'namibia': 'NA',
  'mauritania': 'MR',
  'gambia': 'GM',
  'equatorial guinea': 'GQ',
  'libya': 'LY',
  'sudan': 'SD',
  'comoros': 'KM',
  'madagascar': 'MG',
  'zimbabwe': 'ZW',
  'togo': 'TG',
  'eswatini': 'SZ',
  'rwanda': 'RW',
  'burundi': 'BI',
  'niger': 'NE',
  'chad': 'TD',
  'ethiopia': 'ET',
  'malawi': 'MW',
  'botswana': 'BW',
  'lesotho': 'LS',
  'liberia': 'LR',

  // ── Asia (AFC) ────────────────────────────────────────────────────────
  'japan': 'JP',
  'south korea': 'KR',
  'korea republic': 'KR',
  'north korea': 'KP',
  'korea dpr': 'KP',
  'iran': 'IR',
  'ir iran': 'IR',
  'saudi arabia': 'SA',
  'qatar': 'QA',
  'iraq': 'IQ',
  'jordan': 'JO',
  'uzbekistan': 'UZ',
  'australia': 'AU',
  'china': 'CN',
  'china pr': 'CN',
  'india': 'IN',
  'indonesia': 'ID',
  'thailand': 'TH',
  'vietnam': 'VN',
  'united arab emirates': 'AE',
  'uae': 'AE',
  'bahrain': 'BH',
  'kuwait': 'KW',
  'oman': 'OM',
  'syria': 'SY',
  'lebanon': 'LB',
  'palestine': 'PS',
  'kyrgyzstan': 'KG',
  'tajikistan': 'TJ',
  'turkmenistan': 'TM',
  'myanmar': 'MM',
  'philippines': 'PH',
  'malaysia': 'MY',
  'singapore': 'SG',
  'hong kong': 'HK',
  'chinese taipei': 'TW',
  'taiwan': 'TW',
  'nepal': 'NP',
  'bangladesh': 'BD',
  'pakistan': 'PK',
  'afghanistan': 'AF',
  'yemen': 'YE',

  // ── Oceania (OFC) ─────────────────────────────────────────────────────
  'new zealand': 'NZ',
  'fiji': 'FJ',
  'papua new guinea': 'PG',
  'solomon islands': 'SB',
  'vanuatu': 'VU',
  'new caledonia': 'NC',
  'tahiti': 'PF',
};

/**
 * Normalise a team/country name for lookup: strip accents, lowercase,
 * drop apostrophes/periods, and collapse whitespace.
 * "Côte d'Ivoire" -> "cote divoire"
 */
function normalize(name) {
  return name
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .replace(/['’.]/g, '')
    .replace(/\s+/g, ' ')
    .trim();
}

const FALLBACK_FLAG = '⚽';

/**
 * Get a flag emoji for a team/country name. Falls back to a neutral ball
 * icon for anything unrecognised, so an unmapped name never breaks layout.
 */
export function getFlag(name) {
  if (!name) return FALLBACK_FLAG;
  const code = NAME_TO_FLAG[normalize(name)];
  if (!code) return FALLBACK_FLAG;
  return code.length === 2 ? isoToFlag(code) : code;
}
