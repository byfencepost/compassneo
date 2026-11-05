import {
  SubjectArt, SubjectBusiness, SubjectComputing, SubjectDesign, SubjectDrama, SubjectEnglish, SubjectFood, SubjectHealth,
  SubjectHomeroom, SubjectHumanities, SubjectLanguage, SubjectLaw, SubjectMaths, SubjectMedia, SubjectMusic, SubjectNature,
  SubjectOther, SubjectScience, SubjectSport, SubjectTechnology, type GlazeIcon,
} from "@/components/glaze/icon";

/**
 * A glyph for a subject, from the words in its name ("Year 10 Mathematics", "Physical Education General", "Media").
 * The first rule that matches wins, so the narrower ones come first (Computer Programming before Technologies).
 */
const RULES: Array<[RegExp, GlazeIcon]> = [
  [/\b(homeroom|home room|form|hr|pastoral|tutor)\b/i, SubjectHomeroom],
  [/(comput|programming|coding|digital tech|software|robotic|information tech|\bict\b|\bit\b)/i, SubjectComputing],
  [/(math|calculus|statistic|algebra)/i, SubjectMaths],
  [/(english|literature|literacy|writing)/i, SubjectEnglish],
  [/(health)/i, SubjectHealth],
  [/(physical ed|phys ed|\bpe\b|sport|outdoor ed|fitness)/i, SubjectSport],
  [/(hass|humanities|history|geograph|civics|social)/i, SubjectHumanities],
  [/(science|physics|chemistry|biology|psychology|\bstem\b)/i, SubjectScience],
  [/(media|film|photograph)/i, SubjectMedia],
  [/(music|band|choir)/i, SubjectMusic],
  [/(drama|theatre|dance)/i, SubjectDrama],
  [/(\bart\b|arts|visual|painting|ceramic)/i, SubjectArt],
  [/(french|japanese|chinese|mandarin|italian|indonesian|german|spanish|language|eal)/i, SubjectLanguage],
  [/(food|hospitality|home ec|cooking)/i, SubjectFood],
  [/(law|legal|politic)/i, SubjectLaw],
  [/(agricult|horticult|environment|marine)/i, SubjectNature],
  [/(design|wood|metal|materials|engineering|textiles)/i, SubjectDesign],
  [/(business|econom|accounting|commerce|enterprise)/i, SubjectBusiness],
  [/(technolog|tech\b)/i, SubjectTechnology],
];

export function subjectIcon(...names: Array<string | null | undefined>): GlazeIcon {
  const text = names.filter(Boolean).join(" ");
  return RULES.find(([re]) => re.test(text))?.[1] ?? SubjectOther;
}

/**
 * The main subjects, the only ones home shows a grade for (the rest wait on the Grades page): Maths, English, Science
 * and HASS, in that order, read from the class's name and its Connect subject ("Maths", "Mathematics", "English
 * Literature", "Humanities and Social Sciences"). Computing and STEM are never one, whatever their names say.
 */
const NOT_MAIN = /(comput|programming|coding|digital|\bstem\b|\bict\b)/i;
const MAIN: RegExp[] = [/\bmath(s|ematics)?\b/i, /\b(english|literature)\b/i, /\bscience\b/i, /\b(hass|humanities)\b/i];

/** Where a subject sits among the main ones (0 Maths, 1 English, 2 Science, 3 HASS), or -1 for any other. */
export function mainSubject(...names: Array<string | null | undefined>): number {
  const text = names.filter(Boolean).join(" ");
  if (NOT_MAIN.test(text)) return -1;
  // HASS before Science: "Humanities and Social Sciences" is HASS.
  if (MAIN[3]!.test(text)) return 3;
  return MAIN.findIndex(re => re.test(text));
}
