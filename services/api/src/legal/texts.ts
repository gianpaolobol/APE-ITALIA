/**
 * Privacy notice and terms of service (Italian), served at /privacy and /termini for the app stores.
 * DRAFT prepared for legal review: fields in [square brackets] must be completed by the owner, and the
 * texts must be checked by a lawyer/DPO before public release.
 */
export const LEGAL_VERSION = '2026-11-23-bozza';

export const PRIVACY_MD = `# Informativa privacy – APE Italia

Versione ${LEGAL_VERSION}. **Bozza da completare e verificare prima della pubblicazione.**

## Titolare del trattamento
[Nome e cognome / ragione sociale], P.IVA [numero], [indirizzo], email [privacy@dominio]. Contatto per l’esercizio dei diritti: [email].

## Quali dati trattiamo
- Dati di contatto: nome, email, telefono, disponibilità per il sopralluogo.
- Dati dell’immobile: indirizzo, dati catastali, caratteristiche dell’edificio e degli impianti dichiarate nel questionario.
- Foto, video e documenti caricati (es. planimetria, targhette, libretto di impianto). I video sono conservati **senza audio** e **senza metadati di posizione**; dalle foto JPEG vengono rimossi i dati EXIF.
- Documento d’identità e delega, solo se chiedi il recupero della planimetria catastale.
- Dati dei certificatori: identità, dati professionali e fiscali, numero di accreditamento SACE.
- Dati di pagamento: gestiti da Stripe; noi riceviamo solo l’esito e l’importo.
- Dati tecnici: registri di accesso e sicurezza.

## Perché li trattiamo e su quale base
- Preparare la richiesta, trovare un certificatore accreditato, organizzare videochiamata e sopralluogo e consegnarti l’APE: esecuzione del contratto (art. 6.1.b GDPR).
- Lettura automatica di foto e video con intelligenza artificiale, solo se la attivi: consenso (art. 6.1.a), revocabile in ogni momento.
- Pagamenti, fatturazione e obblighi di legge: art. 6.1.c.
- Sicurezza del servizio e prevenzione di abusi: legittimo interesse (art. 6.1.f).

## A chi li comunichiamo
- Al **certificatore accreditato** che accetta l’incarico: prima dell’accettazione vede solo comune, tipo di immobile, superficie e compenso; dopo, i dati necessari al lavoro. Il certificatore è titolare autonomo per la redazione e il deposito dell’APE.
- Fornitori che trattano dati per nostro conto (responsabili ex art. 28): hosting in UE [nome], invio email [Brevo], pagamenti [Stripe], lettura AI di foto/video [Anthropic, se attivata], videochiamate [Jitsi Meet].
- Autorità, quando richiesto dalla legge.

## Trasferimenti fuori dall’UE
Se un fornitore tratta dati fuori dall’UE (es. servizi di intelligenza artificiale), lo fa con garanzie adeguate (decisione di adeguatezza o clausole contrattuali standard).

## Per quanto tempo
- Account: fino alla cancellazione, che puoi fare dall’app.
- Richieste non inviate: cancellate con l’account.
- Video: 90 giorni dalla consegna dell’APE.
- Foto, documenti e verbale collegati all’APE: per il tempo necessario agli obblighi del certificatore e ai controlli regionali (indicativamente la validità dell’APE, 10 anni).
- Dati di pagamento e fatturazione: 10 anni (obblighi fiscali).

## I tuoi diritti
Accesso, rettifica, cancellazione, limitazione, portabilità, opposizione e revoca del consenso, scrivendo a [email]. Puoi proporre reclamo al Garante per la protezione dei dati personali (www.garanteprivacy.it).

## Minori
Il servizio è riservato a maggiorenni.
`;

export const TERMS_MD = `# Termini del servizio – APE Italia

Versione ${LEGAL_VERSION}. **Bozza da completare e verificare prima della pubblicazione.**

## Il servizio
APE Italia ti aiuta a richiedere l’Attestato di Prestazione Energetica (APE) in Emilia-Romagna: raccoglie i dati e le foto dell’immobile, stima in modo indicativo la classe energetica e ti mette in contatto con un **certificatore energetico accreditato** nel sistema regionale SACE.

## Cosa non è
- La **stima dell’app non è un APE** e non ha valore legale.
- L’APE è redatto, firmato e depositato sul portale regionale **solo dal certificatore**, dopo il **sopralluogo obbligatorio** in presenza. La videochiamata è facoltativa e non sostituisce il sopralluogo.
- Il certificatore opera in modo indipendente: la piattaforma non influisce sulla classe energetica.

## Prezzi e pagamento
- Prezzo fisso regionale indicato nell’app prima dell’invio, IVA, cassa previdenziale e contributo regionale SACE inclusi. Eventuali servizi aggiuntivi (urgenza, recupero visura e planimetria) sono indicati a parte.
- Si paga **dopo il sopralluogo**. L’APE è scaricabile dopo il pagamento.
- Se la planimetria catastale non è reperibile, il relativo costo è rimborsato.
- [Indicare chi emette la fattura al cliente: piattaforma o certificatore.]

## Annullamento
Puoi annullare gratuitamente fino all’accettazione del certificatore. Dopo, e fino al giorno prima del sopralluogo, [condizioni da definire]. Restano salvi i diritti del consumatore previsti dal Codice del Consumo.

## Impegni dell’utente
Dichiari dati veritieri e di avere titolo sull’immobile o la delega del proprietario. Foto e video non devono ritrarre persone o contenuti non necessari.

## Certificatori
Possono iscriversi solo certificatori accreditati in Emilia-Romagna; il numero SACE è verificato prima dell’attivazione. Si impegnano a eseguire personalmente il sopralluogo, a redigere il verbale e a rispettare la normativa (D.Lgs. 192/2005, DPR 75/2013, DGR 1275/2015 e s.m.i.).

## Responsabilità
La piattaforma risponde del servizio di intermediazione; il contenuto dell’APE è responsabilità del certificatore che lo firma.

## Contatti e foro
[Email di assistenza]. Per i consumatori è competente il foro di residenza del consumatore.
`;

/** Minimal Markdown → HTML for the two pages above (headings, lists, bold, paragraphs). Text is static. */
export function renderLegal(md: string): string {
 const esc = (t: string) => t.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
 const inline = (t: string) => esc(t).replace(/\*\*(.+?)\*\*/g, '<strong>$1</strong>');
 const out: string[] = [];
 let list = false;
 for (const line of md.split('\n')) {
  if (line.startsWith('- ')) { if (!list) { out.push('<ul>'); list = true; } out.push(`<li>${inline(line.slice(2))}</li>`); continue; }
  if (list) { out.push('</ul>'); list = false; }
  if (line.startsWith('## ')) out.push(`<h2>${inline(line.slice(3))}</h2>`);
  else if (line.startsWith('# ')) out.push(`<h1>${inline(line.slice(2))}</h1>`);
  else if (line.trim()) out.push(`<p>${inline(line)}</p>`);
 }
 if (list) out.push('</ul>');
 return `<!doctype html><html lang="it"><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>APE Italia</title><body style="font-family:-apple-system,system-ui,sans-serif;max-width:720px;margin:auto;padding:24px;line-height:1.5;color:#0E1A16">${out.join('\n')}</body></html>`;
}
