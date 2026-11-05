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
