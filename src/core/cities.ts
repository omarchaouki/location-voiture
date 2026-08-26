/**
 * VILLES MAROCAINES — celles où l'on loue des voitures.
 *
 * La liste n'est pas exhaustive et n'a pas à l'être : elle sert à aider la saisie,
 * pas à autoriser. Le champ qui s'en sert accepte le texte libre (voir
 * `src/ui/forms/city-combobox.tsx`) ; une liste écrite depuis un bureau de
 * Casablanca ne doit pas refuser Imilchil.
 *
 * Chaque entrée porte les DEUX écritures. Ce n'est pas de la décoration :
 *
 *  - l'interface arabe doit afficher « الدار البيضاء », pas « Casablanca » en
 *    caractères latins au milieu d'une page RTL ;
 *  - la recherche compare les deux en même temps, parce qu'un gérant tape
 *    indifféremment l'une ou l'autre selon le clavier qu'il a sous la main.
 *
 * Ordre : par importance pour la location, pas alphabétique. Les six premières
 * couvrent l'essentiel du marché, et une liste qui s'ouvre sur « Agadir,
 * Casablanca, Marrakech » est plus utile qu'une qui s'ouvre sur « Ahfir ».
 */

export interface MoroccanCity {
  fr: string
  ar: string
}

export const MOROCCAN_CITIES: readonly MoroccanCity[] = [
  { fr: 'Casablanca', ar: 'الدار البيضاء' },
  { fr: 'Marrakech', ar: 'مراكش' },
  { fr: 'Agadir', ar: 'أكادير' },
  { fr: 'Tanger', ar: 'طنجة' },
  { fr: 'Rabat', ar: 'الرباط' },
  { fr: 'Fès', ar: 'فاس' },
  { fr: 'Meknès', ar: 'مكناس' },
  { fr: 'Oujda', ar: 'وجدة' },
  { fr: 'Kénitra', ar: 'القنيطرة' },
  { fr: 'Tétouan', ar: 'تطوان' },
  { fr: 'Essaouira', ar: 'الصويرة' },
  { fr: 'Ouarzazate', ar: 'ورزازات' },
  { fr: 'Dakhla', ar: 'الداخلة' },
  { fr: 'Laâyoune', ar: 'العيون' },
  { fr: 'Nador', ar: 'الناظور' },
  { fr: 'El Jadida', ar: 'الجديدة' },
  { fr: 'Safi', ar: 'آسفي' },
  { fr: 'Béni Mellal', ar: 'بني ملال' },
  { fr: 'Mohammedia', ar: 'المحمدية' },
  { fr: 'Salé', ar: 'سلا' },
  { fr: 'Témara', ar: 'تمارة' },
  { fr: 'Khouribga', ar: 'خريبكة' },
  { fr: 'Settat', ar: 'سطات' },
  { fr: 'Berrechid', ar: 'برشيد' },
  { fr: 'Taza', ar: 'تازة' },
  { fr: 'Al Hoceïma', ar: 'الحسيمة' },
  { fr: 'Larache', ar: 'العرائش' },
  { fr: 'Ksar El Kébir', ar: 'القصر الكبير' },
  { fr: 'Guelmim', ar: 'كلميم' },
  { fr: 'Tiznit', ar: 'تيزنيت' },
  { fr: 'Taroudant', ar: 'تارودانت' },
  { fr: 'Errachidia', ar: 'الرشيدية' },
  { fr: 'Ifrane', ar: 'إفران' },
  { fr: 'Chefchaouen', ar: 'شفشاون' },
  { fr: 'Midelt', ar: 'ميدلت' },
  { fr: 'Khémisset', ar: 'الخميسات' },
  { fr: 'Sidi Kacem', ar: 'سيدي قاسم' },
  { fr: 'Sidi Slimane', ar: 'سيدي سليمان' },
  { fr: 'Fquih Ben Salah', ar: 'الفقيه بن صالح' },
  { fr: 'Ouazzane', ar: 'وزان' },
  { fr: 'Azrou', ar: 'أزرو' },
  { fr: 'Zagora', ar: 'زاكورة' },
  { fr: 'Tinghir', ar: 'تنغير' },
  { fr: 'Oulad Teïma', ar: 'أولاد تايمة' },
  { fr: 'Berkane', ar: 'بركان' },
  { fr: 'Bouznika', ar: 'بوزنيقة' },
  { fr: 'Skhirat', ar: 'الصخيرات' },
  { fr: 'Youssoufia', ar: 'اليوسفية' },
  { fr: 'Tan-Tan', ar: 'طانطان' },
  { fr: 'Boujdour', ar: 'بوجدور' },
]
