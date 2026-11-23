/**
 * Guided pre-APE survey. Data-driven: every screen of the wizard is described here, so the UI, the
 * completeness checklist and the energy estimate all read from the same definitions.
 *
 * The survey collects what an accredited certifier needs before the mandatory on-site inspection.
 * It does NOT produce an APE: the result is an indicative estimate and a ready-made dossier.
 */

export type AnswerValue = string | number | boolean | string[];
export type Answers = Record<string, AnswerValue | undefined>;

export type PhotoRef = { uri: string; name: string; mimeType: string; takenAt: string; width?: number; height?: number; durationSec?: number };
export type Photos = Record<string, PhotoRef[] | undefined>;

export type Option = { value: string; label: string; hint?: string; icon?: string };

/** What the AI reader can extract from a photo (server side, when configured). */
export type ExtractKind = 'boiler_nameplate' | 'heat_pump_nameplate' | 'ac_nameplate' | 'cadastral_plan' | 'water_heater_nameplate';

type Base = {
 id: string;
 label: string;
 help?: string;
 /** Required to consider the step complete (only when visible). */
 required?: boolean;
 visible?: (a: Answers) => boolean;
};
export type ChoiceQuestion = Base & { kind: 'choice'; options: Option[]; layout?: 'cards' | 'chips' };
export type MultiQuestion = Base & { kind: 'multi'; options: Option[] };
export type NumberQuestion = Base & { kind: 'number'; unit?: string; min: number; max: number; step?: number; placeholder?: string; decimals?: number };
export type TextQuestion = Base & { kind: 'text'; placeholder?: string; keyboard?: 'default' | 'email' | 'phone' | 'numeric'; autoCapitalize?: 'none' | 'words' | 'sentences'; maxLength?: number; pattern?: RegExp; patternMessage?: string };
export type ToggleQuestion = Base & { kind: 'toggle' };
export type PhotoQuestion = Base & {
 kind: 'photo';
 /** Short instruction shown on the capture tile, e.g. "Inquadra la targhetta argentata". */
 guide: string;
 max?: number;
 allowDocuments?: boolean;
 extract?: ExtractKind;
};
/** Guided walkthrough video; the total duration budget depends on size and type (see survey/video.ts). */
export type VideoQuestion = Base & { kind: 'video'; guide: string[] };
export type Question = ChoiceQuestion | MultiQuestion | NumberQuestion | TextQuestion | ToggleQuestion | PhotoQuestion | VideoQuestion;

export type Step = {
 id: string;
 title: string;
 subtitle: string;
 icon: string;
 questions: Question[];
 visible?: (a: Answers) => boolean;
};

export const PROVINCES: Option[] = [
 { value: 'BO', label: 'Bologna' }, { value: 'MO', label: 'Modena' }, { value: 'RE', label: 'Reggio Emilia' },
 { value: 'PR', label: 'Parma' }, { value: 'PC', label: 'Piacenza' }, { value: 'FE', label: 'Ferrara' },
 { value: 'RA', label: 'Ravenna' }, { value: 'FC', label: 'Forlì-Cesena' }, { value: 'RN', label: 'Rimini' },
];

const isHouse = (a: Answers) => a.propertyType === 'casa' || a.propertyType === 'schiera';
const hasRoof = (a: Answers) => isHouse(a) || a.floorPosition === 'ultimo' || a.floorPosition === 'unico';
const hasGroundFloor = (a: Answers) => isHouse(a) || a.floorPosition === 'terra' || a.floorPosition === 'unico';
const gen = (a: Answers) => a.heatGenerator as string | undefined;
const isBoiler = (a: Answers) => gen(a) === 'caldaia_condensazione' || gen(a) === 'caldaia_tradizionale' || gen(a) === 'caldaia_non_so';
const yes = (k: string) => (a: Answers) => a[k] === true;

export const STEPS: Step[] = [
 {
  id: 'motivo', title: 'Perché ti serve l’APE?', subtitle: 'Ci aiuta a darti la priorità giusta', icon: 'flag-outline',
  questions: [
   { id: 'purpose', kind: 'choice', label: 'Motivo', required: true, layout: 'cards', options: [
    { value: 'vendita', label: 'Vendita', hint: 'Obbligatorio dall’annuncio al rogito', icon: 'home-outline' },
    { value: 'affitto', label: 'Affitto', hint: 'Da consegnare all’inquilino', icon: 'key-outline' },
    { value: 'lavori', label: 'Lavori / bonus', hint: 'Ante o post intervento', icon: 'construct-outline' },
    { value: 'altro', label: 'Altro', hint: 'Mutuo, verifica, curiosità', icon: 'ellipsis-horizontal' },
   ] },
   { id: 'urgency', kind: 'choice', label: 'Quando ti serve?', required: true, layout: 'chips', options: [
    { value: 'standard', label: 'Entro 7–10 giorni' }, { value: 'urgente', label: 'Urgente (+49 €, APE entro 48 ore dal sopralluogo)' }, { value: 'flessibile', label: 'Nessuna fretta' },
   ] },
   { id: 'dataNotice', kind: 'toggle', required: true, label: 'Ho letto come vengono usati i miei dati: risposte e foto servono a preparare il fascicolo per il certificatore che farà il sopralluogo' },
   { id: 'aiConsent', kind: 'toggle', label: 'Permetti la lettura automatica delle foto (targhette, planimetria) per compilare i dati al posto tuo', help: 'Le foto lette vengono analizzate da un servizio di intelligenza artificiale e non vengono conservate da esso. Puoi lasciarlo spento e compilare a mano.' },
  ],
 },
 {
  id: 'indirizzo', title: 'Dov’è l’immobile?', subtitle: 'Servizio attivo in tutta l’Emilia-Romagna', icon: 'location-outline',
  questions: [
   { id: 'province', kind: 'choice', label: 'Provincia', required: true, layout: 'chips', options: PROVINCES },
   { id: 'municipality', kind: 'text', label: 'Comune', required: true, placeholder: 'Es. Bologna', autoCapitalize: 'words', maxLength: 80 },
   { id: 'street', kind: 'text', label: 'Via e numero civico', required: true, placeholder: 'Es. Via Rialto 12', autoCapitalize: 'words', maxLength: 120 },
   { id: 'unit', kind: 'text', label: 'Scala / interno (facoltativo)', placeholder: 'Es. Scala B, int. 7', maxLength: 40 },
  ],
 },
 {
  id: 'immobile', title: 'Com’è fatto?', subtitle: 'Dati di base per la stima', icon: 'business-outline',
  questions: [
   { id: 'propertyType', kind: 'choice', label: 'Tipo di immobile', required: true, layout: 'cards', options: [
    { value: 'appartamento', label: 'Appartamento', icon: 'business-outline' },
    { value: 'casa', label: 'Casa indipendente', icon: 'home-outline' },
    { value: 'schiera', label: 'Villetta a schiera', icon: 'albums-outline' },
    { value: 'ufficio', label: 'Ufficio / negozio', icon: 'storefront-outline' },
   ] },
   { id: 'floorPosition', kind: 'choice', label: 'A che piano?', required: true, layout: 'chips', visible: a => a.propertyType === 'appartamento' || a.propertyType === 'ufficio', options: [
    { value: 'terra', label: 'Piano terra' }, { value: 'intermedio', label: 'Piano intermedio' }, { value: 'ultimo', label: 'Ultimo piano' }, { value: 'unico', label: 'Unico piano dell’edificio' },
   ] },
   { id: 'rowPosition', kind: 'choice', label: 'Posizione nella schiera', required: true, layout: 'chips', visible: a => a.propertyType === 'schiera', options: [
    { value: 'testata', label: 'Di testata (3 lati liberi)' }, { value: 'centrale', label: 'Centrale (2 lati liberi)' },
   ] },
   { id: 'floorArea', kind: 'number', label: 'Superficie calpestabile', unit: 'm²', required: true, min: 15, max: 1000, placeholder: '85', help: 'Esclusi balconi, cantine e garage. La trovi sulla planimetria o sull’annuncio.' },
   { id: 'ceilingHeight', kind: 'number', label: 'Altezza dei soffitti', unit: 'm', min: 2.2, max: 6, step: 0.05, decimals: 2, placeholder: '2,70' },
   { id: 'builtPeriod', kind: 'choice', label: 'Anno di costruzione dell’edificio', required: true, layout: 'chips', options: [
    { value: 'pre1945', label: 'Prima del 1945' }, { value: '1946_1975', label: '1946–1975' }, { value: '1976_1991', label: '1976–1991' },
    { value: '1992_2005', label: '1992–2005' }, { value: '2006_2015', label: '2006–2015' }, { value: 'post2015', label: 'Dopo il 2015' },
   ] },
   { id: 'condo', kind: 'toggle', label: 'Fa parte di un condominio', visible: a => a.propertyType !== 'casa' },
  ],
 },
 {
  id: 'video', title: 'Fai un giro con la videocamera', subtitle: 'Un video ci dice più di cento domande', icon: 'videocam-outline',
  questions: [
   { id: 'walkthrough', kind: 'video', label: 'Video dell’immobile', required: true, guide: [
    'Accendi le luci e apri le tapparelle. Tieni il telefono in orizzontale e cammina piano.',
    'Parti dall’ingresso e visita tutte le stanze: in ognuna fai un giro lento e inquadra finestre e termosifoni.',
    'Mostra la caldaia o il generatore, gli split interni e, se puoi, l’unità esterna dal balcone.',
    'Se è una casa, esci e riprendi le facciate e il tetto da fuori.',
    'Evita di riprendere persone e documenti personali. L’audio non viene conservato.',
   ] },
  ],
 },
 {
  id: 'documenti', title: 'Documenti', subtitle: 'Bastano le foto: le leggiamo noi', icon: 'document-text-outline',
  questions: [
   { id: 'hasPlan', kind: 'choice', label: 'Hai la planimetria catastale?', required: true, layout: 'cards', options: [
    { value: 'si', label: 'Sì, ce l’ho', hint: 'Foto o PDF: la trovi nel rogito o dal notaio', icon: 'document-attach-outline' },
    { value: 'spid', label: 'La scarico gratis', hint: 'Con SPID o CIE dal sito dell’Agenzia delle Entrate', icon: 'cloud-download-outline' },
    { value: 'no', label: 'Recuperatela voi', hint: 'Indichi i dati catastali: 14,90 €', icon: 'search-outline' },
   ] },
   { id: 'spidHowTo', kind: 'toggle', visible: a => a.hasPlan === 'spid', required: true,
    label: 'Ho scaricato la planimetria: Agenzia delle Entrate → area riservata (SPID/CIE) → Fabbricati e terreni → Consultazione personale online → planimetria',
    help: 'È gratuito solo per chi risulta intestatario in catasto e richiede pochi minuti. Poi caricala qui sotto.' },
   { id: 'cadastralPlan', kind: 'photo', label: 'Planimetria catastale', required: true, allowDocuments: true, max: 4, extract: 'cadastral_plan', visible: a => a.hasPlan === 'si' || a.hasPlan === 'spid',
    guide: 'Foto o PDF della planimetria. Inquadra tutta la pagina, ben dritta e leggibile.' },
   { id: 'cadastralTown', kind: 'text', label: 'Comune catastale', required: true, autoCapitalize: 'words', maxLength: 60, placeholder: 'Es. Bologna', visible: a => a.hasPlan === 'no',
    help: 'I dati catastali sono nel rogito, nel contratto di affitto, nella visura o nel modello F24 dell’IMU.' },
   { id: 'cadastralSection', kind: 'text', label: 'Sezione (se presente)', maxLength: 10, autoCapitalize: 'none', visible: a => a.hasPlan === 'no' },
   { id: 'cadastralSheet', kind: 'text', label: 'Foglio', required: true, keyboard: 'numeric', maxLength: 6, placeholder: '123', pattern: /^\d{1,5}[A-Za-z]?$/, patternMessage: 'Solo numeri', visible: a => a.hasPlan === 'no' },
   { id: 'cadastralParcel', kind: 'text', label: 'Particella / mappale', required: true, maxLength: 10, placeholder: '456', pattern: /^[0-9A-Za-z/]{1,9}$/, patternMessage: 'Formato non valido', visible: a => a.hasPlan === 'no' },
   { id: 'cadastralSub', kind: 'text', label: 'Subalterno', required: true, keyboard: 'numeric', maxLength: 6, placeholder: '7', pattern: /^\d{1,5}$/, patternMessage: 'Solo numeri', visible: a => a.hasPlan === 'no' },
   { id: 'cadastralDelegation', kind: 'toggle', required: true, visible: a => a.hasPlan === 'no',
    label: 'Delego il certificatore incaricato a richiedere visura e planimetria catastale per mio conto (14,90 € aggiunti al preventivo)',
    help: 'La planimetria è riservata agli intestatari: se non sei l’intestatario catastale, la delega deve firmarla l’intestatario. Se la planimetria non è reperibile in catasto, i 14,90 € ti vengono rimborsati.' },
   { id: 'idDocument', kind: 'photo', label: 'Documento d’identità dell’intestatario', required: true, max: 2, visible: a => a.hasPlan === 'no',
    guide: 'Fronte e retro della carta d’identità dell’intestatario: serve all’Agenzia delle Entrate per la delega. Viene usato solo per questa richiesta.' },
   { id: 'heatingLogbook', kind: 'photo', label: 'Libretto di impianto', allowDocuments: true, max: 6,
    guide: 'Le pagine con i dati dell’impianto (in Emilia-Romagna registrato su CRITER). Se non lo trovi, salta: lo verifica il certificatore.' },
   { id: 'previousApe', kind: 'photo', label: 'APE precedente (se esiste)', allowDocuments: true, max: 4, guide: 'Utile ma non indispensabile.' },
  ],
 },
 {
  id: 'muri', title: 'Muri esterni', subtitle: 'Sono la prima voce delle dispersioni', icon: 'grid-outline',
  questions: [
   { id: 'wallType', kind: 'choice', label: 'Di cosa sono fatti?', required: true, layout: 'cards', options: [
    { value: 'mattoni_pieni', label: 'Mattoni pieni', hint: 'Tipico prima degli anni ’60', icon: 'apps-outline' },
    { value: 'laterizio_forato', label: 'Blocchi / forati', hint: 'Laterizio alveolato o doppio forato', icon: 'grid-outline' },
    { value: 'cassa_vuota', label: 'Doppia parete', hint: 'Due pareti con intercapedine', icon: 'pause-outline' },
    { value: 'pietra', label: 'Pietra', hint: 'Case storiche e rurali', icon: 'cube-outline' },
    { value: 'cemento', label: 'Cemento / prefabbricato', icon: 'layers-outline' },
    { value: 'non_so', label: 'Non lo so', hint: 'Lo stimiamo dall’anno', icon: 'help-circle-outline' },
   ] },
   { id: 'wallThickness', kind: 'number', label: 'Spessore del muro', unit: 'cm', required: true, min: 10, max: 120, placeholder: '30',
    help: 'Misuralo con un metro sul vano di una finestra o della porta d’ingresso, da intonaco a intonaco.' },
   { id: 'wallInsulated', kind: 'toggle', label: 'C’è un cappotto o isolamento' },
   { id: 'wallInsulationCm', kind: 'number', label: 'Spessore isolamento', unit: 'cm', min: 1, max: 30, placeholder: '8', visible: yes('wallInsulated') },
   { id: 'wallPhotos', kind: 'photo', label: 'Foto dello spessore del muro', required: true, max: 3,
    guide: 'Il video non basta per lo spessore: appoggia un metro sul vano di una finestra aperta e scatta una foto in cui si leggano bene i centimetri.' },
  ],
 },
 {
  id: 'finestre', title: 'Finestre', subtitle: 'Vetri e telai pesano molto sulla classe', icon: 'albums-outline',
  questions: [
   { id: 'windowCount', kind: 'number', label: 'Quante finestre e portefinestre?', required: true, min: 1, max: 80, placeholder: '6' },
   { id: 'glazing', kind: 'choice', label: 'Tipo di vetro', required: true, layout: 'cards', options: [
    { value: 'singolo', label: 'Vetro singolo', hint: 'Una sola lastra', icon: 'square-outline' },
    { value: 'doppio', label: 'Doppio vetro', hint: 'Vetrocamera tradizionale', icon: 'copy-outline' },
    { value: 'basso_emissivo', label: 'Basso emissivo', hint: 'Doppio/triplo recente con gas', icon: 'sparkles-outline' },
    { value: 'non_so', label: 'Non lo so', icon: 'help-circle-outline' },
   ] },
   { id: 'frame', kind: 'choice', label: 'Telaio', required: true, layout: 'chips', options: [
    { value: 'legno', label: 'Legno' }, { value: 'pvc', label: 'PVC' }, { value: 'alluminio_tt', label: 'Alluminio a taglio termico' },
    { value: 'metallo', label: 'Alluminio/ferro vecchio' }, { value: 'non_so', label: 'Non lo so' },
   ] },
   { id: 'windowPhotos', kind: 'photo', label: 'Primo piano del vetro', max: 3,
    guide: 'Le finestre le vediamo nel video: qui basta un primo piano del bordo del vetro, dove a volte è stampata la sigla del vetrocamera.' },
  ],
 },
 {
  id: 'involucro', title: 'Tetto e pavimento', subtitle: 'Solo per le superfici verso l’esterno', icon: 'triangle-outline',
  visible: a => hasRoof(a) || hasGroundFloor(a),
  questions: [
   { id: 'roofInsulated', kind: 'choice', label: 'Il tetto/sottotetto è isolato?', required: true, layout: 'chips', visible: hasRoof, options: [
    { value: 'si', label: 'Sì' }, { value: 'no', label: 'No' }, { value: 'non_so', label: 'Non lo so' },
   ] },
   { id: 'groundFloorType', kind: 'choice', label: 'Sotto il pavimento c’è…', required: true, layout: 'chips', visible: hasGroundFloor, options: [
    { value: 'terreno', label: 'Terreno' }, { value: 'cantina', label: 'Cantina / garage' }, { value: 'porticato', label: 'Porticato aperto' },
   ] },
  ],
 },
 {
  id: 'riscaldamento', title: 'Riscaldamento', subtitle: 'La foto della targhetta vale più di mille parole', icon: 'flame-outline',
  questions: [
   { id: 'heatingSystem', kind: 'choice', label: 'L’impianto è…', required: true, layout: 'chips', options: [
    { value: 'autonomo', label: 'Autonomo' }, { value: 'centralizzato', label: 'Centralizzato (condominio)' }, { value: 'nessuno', label: 'Nessun impianto' },
   ] },
   { id: 'heatGenerator', kind: 'choice', label: 'Cosa produce il calore?', required: true, layout: 'cards', visible: a => a.heatingSystem !== 'nessuno', options: [
    { value: 'caldaia_condensazione', label: 'Caldaia a condensazione', hint: 'Tubo di scarico in plastica, scarico condensa', icon: 'flame-outline' },
    { value: 'caldaia_tradizionale', label: 'Caldaia tradizionale', hint: 'Fumi in tubo metallico', icon: 'bonfire-outline' },
    { value: 'caldaia_non_so', label: 'Caldaia, non so di che tipo', hint: 'Lo capiamo dalla targhetta', icon: 'help-circle-outline' },
    { value: 'pompa_calore', label: 'Pompa di calore', hint: 'Unità esterna che riscalda', icon: 'snow-outline' },
    { value: 'biomassa', label: 'Stufa a pellet / legna', icon: 'leaf-outline' },
    { value: 'teleriscaldamento', label: 'Teleriscaldamento', icon: 'git-network-outline' },
    { value: 'elettrico', label: 'Stufe elettriche', icon: 'flash-outline' },
   ] },
   { id: 'fuel', kind: 'choice', label: 'Combustibile', required: true, layout: 'chips', visible: isBoiler, options: [
    { value: 'metano', label: 'Metano' }, { value: 'gpl', label: 'GPL' }, { value: 'gasolio', label: 'Gasolio' },
   ] },
   { id: 'generatorPlate', kind: 'photo', label: 'Targhetta del generatore', required: true, max: 3,
    extract: 'boiler_nameplate', visible: a => a.heatingSystem === 'autonomo' && gen(a) !== 'elettrico' && gen(a) !== 'teleriscaldamento' && gen(a) !== undefined,
    guide: 'Apri lo sportellino della caldaia o guarda il fianco della pompa di calore: fotografa la targhetta con marca, modello, potenza (kW) e anno. Niente riflessi.' },
   { id: 'generatorManual', kind: 'photo', label: 'Libretto istruzioni o scheda tecnica', allowDocuments: true, max: 4,
    visible: a => a.heatingSystem === 'autonomo' && gen(a) !== 'elettrico' && gen(a) !== undefined,
    guide: 'Facoltativo: la pagina con i “dati tecnici”. Utile se la targhetta è illeggibile.' },
   { id: 'generatorBrand', kind: 'text', label: 'Marca e modello', placeholder: 'Es. Vaillant ecoTEC plus', maxLength: 80, visible: a => a.heatingSystem === 'autonomo' && gen(a) !== 'elettrico' && gen(a) !== undefined,
    help: 'Se la foto è leggibile li compiliamo noi in automatico.' },
   { id: 'generatorPowerKw', kind: 'number', label: 'Potenza', unit: 'kW', min: 1, max: 500, decimals: 1, placeholder: '24', visible: a => a.heatingSystem === 'autonomo' && gen(a) !== 'elettrico' && gen(a) !== undefined },
   { id: 'generatorYear', kind: 'number', label: 'Anno di installazione', min: 1960, max: 2026, placeholder: '2012', visible: a => a.heatingSystem !== 'nessuno' && gen(a) !== 'elettrico' && gen(a) !== undefined },
   { id: 'emitters', kind: 'choice', label: 'Come arriva il calore nelle stanze?', required: true, layout: 'chips', visible: a => a.heatingSystem !== 'nessuno' && gen(a) !== 'biomassa' && gen(a) !== 'elettrico', options: [
    { value: 'radiatori', label: 'Termosifoni' }, { value: 'pavimento', label: 'Pavimento radiante' }, { value: 'ventilconvettori', label: 'Ventilconvettori' },
   ] },
   { id: 'controls', kind: 'multi', label: 'Regolazione (tocca tutto ciò che c’è)', visible: a => a.heatingSystem !== 'nessuno', options: [
    { value: 'cronotermostato', label: 'Termostato / cronotermostato' }, { value: 'valvole', label: 'Valvole termostatiche' }, { value: 'sonda_esterna', label: 'Sonda esterna' },
   ] },
   { id: 'emitterPhotos', kind: 'photo', label: 'Foto di un termosifone o terminale', max: 2, visible: a => a.heatingSystem !== 'nessuno' && gen(a) !== 'biomassa' && gen(a) !== 'elettrico',
    guide: 'Un termosifone intero con la valvola. Se c’è una valvola termostatica, inquadrala.' },
  ],
 },
 {
  id: 'acqua', title: 'Acqua calda', subtitle: 'Docce, lavandini, cucina', icon: 'water-outline',
  questions: [
   { id: 'dhw', kind: 'choice', label: 'Chi scalda l’acqua?', required: true, layout: 'cards', options: [
    { value: 'stesso_generatore', label: 'Lo stesso impianto', hint: 'La caldaia/pompa di calore del riscaldamento', icon: 'repeat-outline' },
    { value: 'boiler_elettrico', label: 'Boiler elettrico', icon: 'flash-outline' },
    { value: 'boiler_gas', label: 'Scaldabagno a gas', icon: 'flame-outline' },
    { value: 'pdc_acs', label: 'Scaldacqua a pompa di calore', icon: 'thermometer-outline' },
   ] },
   { id: 'dhwPlate', kind: 'photo', label: 'Targhetta dello scaldacqua', required: true, max: 2, extract: 'water_heater_nameplate', visible: a => a.dhw !== undefined && a.dhw !== 'stesso_generatore',
    guide: 'Etichetta con marca, modello, capacità (litri) e potenza.' },
  ],
 },
 {
  id: 'raffrescamento', title: 'Raffrescamento', subtitle: 'Condizionatori e split', icon: 'snow-outline',
  questions: [
   { id: 'cooling', kind: 'choice', label: 'C’è un impianto di raffrescamento?', required: true, layout: 'chips', options: [
    { value: 'nessuno', label: 'No' }, { value: 'split', label: 'Sì, split' }, { value: 'centralizzato', label: 'Sì, canalizzato/centralizzato' },
   ] },
   { id: 'splitIndoorCount', kind: 'number', label: 'Quante unità interne (split)?', required: true, min: 1, max: 30, placeholder: '3', visible: a => a.cooling === 'split' },
   { id: 'coolingYear', kind: 'number', label: 'Anno di installazione', min: 1980, max: 2026, placeholder: '2018', visible: a => a.cooling !== undefined && a.cooling !== 'nessuno' },
   { id: 'coolingPlate', kind: 'photo', label: 'Targhetta dell’unità esterna', required: true, max: 4, extract: 'ac_nameplate', visible: a => a.cooling !== undefined && a.cooling !== 'nessuno',
    guide: 'L’etichetta sul fianco del motore esterno: modello, potenza, gas refrigerante. Una foto per ogni unità esterna.' },
  ],
 },
 {
  id: 'rinnovabili', title: 'Rinnovabili', subtitle: 'Migliorano la classe', icon: 'sunny-outline',
  questions: [
   { id: 'pv', kind: 'toggle', label: 'Impianto fotovoltaico a servizio dell’immobile' },
   { id: 'pvKw', kind: 'number', label: 'Potenza fotovoltaico', unit: 'kWp', min: 0.5, max: 100, decimals: 1, placeholder: '3', visible: yes('pv') },
   { id: 'solarThermal', kind: 'toggle', label: 'Pannelli solari termici per l’acqua calda' },
   { id: 'renewablePhotos', kind: 'photo', label: 'Foto dei pannelli o dell’inverter', max: 3, visible: a => a.pv === true || a.solarThermal === true,
    guide: 'I pannelli sul tetto e/o l’etichetta dell’inverter.' },
  ],
 },
 {
  id: 'contatti', title: 'Ultimo passo', subtitle: 'Per organizzare il sopralluogo', icon: 'person-outline',
  questions: [
   { id: 'fullName', kind: 'text', label: 'Nome e cognome', required: true, autoCapitalize: 'words', maxLength: 80, placeholder: 'Mario Rossi' },
   { id: 'phone', kind: 'text', label: 'Telefono', required: true, keyboard: 'phone', maxLength: 20, placeholder: '333 123 4567', pattern: /^\+?[0-9 ]{8,16}$/, patternMessage: 'Numero non valido' },
   { id: 'email', kind: 'text', label: 'Email', required: true, keyboard: 'email', autoCapitalize: 'none', maxLength: 120, placeholder: 'nome@email.it', pattern: /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/, patternMessage: 'Email non valida' },
   { id: 'availability', kind: 'multi', label: 'Quando sei disponibile per il sopralluogo?', required: true, options: [
    { value: 'mattina', label: 'Mattina' }, { value: 'pomeriggio', label: 'Pomeriggio' }, { value: 'sera', label: 'Dopo le 18' }, { value: 'sabato', label: 'Sabato' },
   ] },
   { id: 'privacy', kind: 'toggle', label: 'Accetto che i miei dati, le risposte e le foto vengano inviati ai certificatori accreditati della mia zona per preventivo e sopralluogo', required: true },
  ],
 },
];

export function visibleSteps(a: Answers): Step[] {
 return STEPS.filter(s => (s.visible ? s.visible(a) : true) && s.questions.some(q => isVisible(q, a)));
}

export function isVisible(q: Question, a: Answers): boolean {
 return q.visible ? q.visible(a) : true;
}

export function isAnswered(q: Question, a: Answers, p: Photos): boolean {
 if (q.kind === 'photo' || q.kind === 'video') return (p[q.id]?.length ?? 0) > 0;
 const v = a[q.id];
 if (q.kind === 'toggle') return q.required ? v === true : v !== undefined;
 if (q.kind === 'multi') return Array.isArray(v) && v.length > 0;
 if (q.kind === 'number') return typeof v === 'number' && Number.isFinite(v) && v >= q.min && v <= q.max;
 if (q.kind === 'text') return typeof v === 'string' && v.trim().length > 0 && (!q.pattern || q.pattern.test(v.trim()));
 return typeof v === 'string' && q.options.some(o => o.value === v);
}

/** Validation message for a single question, or null when acceptable (empty optional fields are fine). */
export function questionError(q: Question, a: Answers): string | null {
 const v = a[q.id];
 if (q.kind === 'number' && v !== undefined) {
  if (typeof v !== 'number' || !Number.isFinite(v)) return 'Inserisci un numero';
  if (v < q.min || v > q.max) return `Valore tra ${q.min} e ${q.max}${q.unit ? ' ' + q.unit : ''}`;
 }
 if (q.kind === 'text' && typeof v === 'string' && v.trim() && q.pattern && !q.pattern.test(v.trim())) return q.patternMessage ?? 'Formato non valido';
 return null;
}

export function stepMissing(s: Step, a: Answers, p: Photos): Question[] {
 return s.questions.filter(q => q.required && isVisible(q, a) && !isAnswered(q, a, p));
}

/** Removes answers to questions that are no longer visible (e.g. after changing property type). */
export function pruneHidden(a: Answers, p: Photos): { answers: Answers; photos: Photos } {
 const answers: Answers = {}; const photos: Photos = {};
 for (const s of STEPS) for (const q of s.questions) {
  const show = (s.visible ? s.visible(a) : true) && isVisible(q, a);
  if (!show) continue;
  if (q.kind === 'photo' || q.kind === 'video') { if (p[q.id]) photos[q.id] = p[q.id]; }
  else if (a[q.id] !== undefined) answers[q.id] = a[q.id];
 }
 return { answers, photos };
}

export function findQuestion(id: string): Question | undefined {
 for (const s of STEPS) for (const q of s.questions) if (q.id === id) return q;
 return undefined;
}
