# Piano operativo: da prototipo ad app funzionante

Aggiornato al 23/11/2026. Obiettivo: provare APE Italia su casi reali in Emilia-Romagna, con il cliente che fa video e foto, l'AI che prepara il fascicolo e un certificatore accreditato che fa il sopralluogo, firma e deposita l'APE.

## Punto fermo normativo

In Emilia-Romagna il **sopralluogo in presenza del certificatore è obbligatorio**. Se manca, l'APE è nullo. Va documentato con un "verbale del sopralluogo obbligatorio" (DGR 1275/2015 modificata dalla DGR 1385/2020). Anche la normativa nazionale (D.Lgs. 192/2005) richiede la data del sopralluogo nell'APE.

Una **videochiamata non può sostituire il sopralluogo**. Può però:

- fare da **pre-sopralluogo**: il certificatore verifica documenti, impianto e punti dubbi e prepara la visita;
- **ridurre la visita** a 20–40 minuti mirati, invece di un rilievo da zero.

Il video, le foto e l'analisi AI servono allo stesso scopo: arrivare al sopralluogo con il fascicolo già pronto.

## Video dell'immobile: durate

Il criterio è circa 20–25 secondi per stanza, più l'esterno per le case. Il video si può dividere in un massimo di 3 parti (per esempio una per piano).

| Superficie | Durata massima |
|---|---|
| fino a 60 m² | 1:30 |
| 61–100 m² | 2:00 |
| 101–150 m² | 3:00 |
| 151–250 m² | 4:00 |
| oltre 250 m² | 5:00 |
| case e villette a schiera | +1:00 per facciate, tetto e unità esterne, **massimo assoluto 6:00** |

Formato: 720p. Sono circa 30–40 MB al minuto, quindi un video da 6 minuti pesa circa 200 MB (limite tecnico: 300 MB). Per questo il caricamento a pezzi della Fase 2 è importante sulle reti mobili.

Privacy: sul server il video viene rimontato **senza audio** e **senza metadati** (posizione GPS, dispositivo).

Cosa il video **non** basta a stabilire, e resta da fotografare:

- spessore dei muri (metro sul vano finestra);
- targhette di caldaia, scaldacqua e unità esterne;
- sigla del vetrocamera;
- planimetria catastale.

La superficie si ricava dalla planimetria, non dal video.

## Fasi

### Fase 1 – Server di prova online (staging)

Serve il titolare per gli account e i costi.

- [ ] Hosting UE: una VM (es. Hetzner o Scaleway, 2 vCPU e 4 GB, circa 10–20 €/mese) con il docker-compose di staging già pronto. In alternativa un PaaS.
- [ ] Dominio e certificato TLS, per esempio `api.apeitalia.it`.
- [ ] Database PostgreSQL con backup giornaliero; lo script esiste già.
- [ ] Storage cifrato per foto e video: disco della VM oppure object storage UE.
- [ ] Antivirus ClamAV; il container è già previsto.
- [ ] Login: per i clienti un codice via email (OTP), più semplice dell'OIDC completo. Per certificatori e operatori, Keycloak, già pronto.
- [ ] Email transazionali (es. Brevo o Postmark) per conferme e notifiche.
- [ ] Chiave API del modello AI per la lettura delle foto e del video, con DPA del fornitore.

### Fase 2 – Flusso cliente completo

- [x] Questionario guidato, foto guidate, stima indicativa, checklist e prezzo.
- [x] Video guidato con limiti di durata per superficie e tipologia.
- [x] Invio di questionario, foto e video al server, con ripresa se si interrompe.
- [ ] Caricamento dei video a pezzi (resumable), per le reti mobili lente.
- [ ] Analisi AI del video. Si estraggono fotogrammi (circa 1 al secondo e a ogni cambio di scena) per rilevare:
  - stanze, finestre e tipo di serramento;
  - termosifoni e valvole;
  - split, caldaia e segni di umidità.
  
  Ne esce un pre-rilievo da confermare, con un indice di affidabilità per ogni dato.
- [ ] Lettura AI delle targhette e della planimetria (già pronta lato server, va solo attivata con la chiave).
- [ ] Stato della richiesta visibile al cliente: in valutazione → assegnata → sopralluogo fissato → APE consegnato.

### Fase 3 – Flusso certificatore

- [x] Candidatura con numero SACE obbligatorio.
- [ ] Pannello operatore per approvare le candidature dopo il controllo sull'elenco pubblico SACE.
- [ ] Notifica degli incarichi nelle province scelte: accetta o rifiuta (il motore di assegnazione esiste già).
- [ ] Fascicolo per il certificatore: contatti, risposte, video, foto, pre-rilievo AI ed esportazione verso il software di calcolo (l'export esiste già).
- [ ] Videochiamata facoltativa di pre-sopralluogo, con link Jitsi o Meet e data concordata.
- [ ] Agenda del sopralluogo con le disponibilità del cliente.
- [ ] **Verbale del sopralluogo obbligatorio** digitale, con i contenuti minimi della DGR 1385/2020 e la firma del proprietario sul telefono del certificatore.
- [ ] Consegna dell'APE: caricamento del PDF e del codice SACE e consegna al cliente (in parte esiste già).

### Fase 4 – Pagamenti e fatturazione

- [ ] Stripe Connect: il cliente paga dopo il sopralluogo, con pre-autorizzazione alla conferma. Il pagamento viene diviso in automatico tra certificatore e piattaforma.
- [ ] Regola fiscale con il commercialista: chi fattura al cliente, come si tratta il regime forfettario, la cassa previdenziale e il contributo SACE.

### Fase 5 – Aspetti legali

- [ ] Informativa privacy e termini per clienti e certificatori; DPA con il fornitore AI.
- [ ] Conservazione dei video: cancellazione 90 giorni dopo la consegna dell'APE, salvo contestazioni.
- [ ] Indipendenza del certificatore (DPR 75/2013): la piattaforma non influenza la classe.
- [ ] Verifica a mano del testo coordinato della DGR 1385/2020.

### Fase 6 – Pilota

- [ ] 3–5 certificatori a Bologna e provincia, 20–30 richieste reali.
- [ ] Misurare per ogni dato:
  - quanto l'AI e la stima concordano con quanto rilevato al sopralluogo;
  - quanto tempo si risparmia;
  - quanto sono soddisfatti clienti e certificatori.
- [ ] Ricalibrare il modello di stima e il listino.

### Fase 7 – Pubblicazione

- [ ] App Store (TestFlight esterno, poi revisione Apple) e Google Play (con chiave di firma).
- [ ] Sito web per clienti e certificatori; il web BFF esiste già.

## Cosa serve dal titolare

1. Scelta e account dell'hosting UE, più un dominio.
2. Chiave API del modello AI (Anthropic) e accettazione del DPA.
3. Account Stripe.
4. Un commercialista per la regola fiscale.
5. 3–5 certificatori disponibili per il pilota.
