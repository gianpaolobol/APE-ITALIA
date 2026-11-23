# Schede per App Store e Google Play (bozza)

## Dati comuni
- **Nome:** APE Italia
- **Sottotitolo (App Store, max 30):** APE con certificatore vicino
- **Breve descrizione (Play, max 80):** Richiedi l’APE in Emilia-Romagna: domande, foto e stima della classe subito.
- **Categoria:** Produttività (secondaria: Casa e arredamento / Utility)
- **Età:** 4+ / PEGI 3; nessun contenuto generato da utenti pubblico.
- **URL privacy:** https://API_DOMAIN/privacy  · **Termini:** https://API_DOMAIN/termini
- **Supporto:** email di assistenza (da definire)

## Descrizione
Ti serve l’Attestato di Prestazione Energetica per vendere o affittare casa in Emilia-Romagna?

Con APE Italia rispondi a poche domande, fai un breve video dell’immobile e qualche foto guidata (caldaia, finestre, spessore dei muri, planimetria). Vedi subito una **stima indicativa** della classe energetica, dove si disperde il calore e come migliorarla.

Un **certificatore energetico accreditato SACE** della tua zona riceve il fascicolo già pronto, può fare una videochiamata di pre-sopralluogo, viene per il **sopralluogo obbligatorio**, firma e deposita l’APE sul portale regionale. Lo scarichi dall’app.

- Prezzo fisso in tutta l’Emilia-Romagna, IVA e contributo regionale inclusi
- Paghi dopo il sopralluogo
- Planimetria: caricala, scaricala gratis con SPID o la recupera il certificatore
- Per i certificatori: incarichi nelle tue province, fascicoli completi, verbale digitale

La stima dell’app non è un APE: l’attestato è redatto solo dal certificatore accreditato dopo il sopralluogo.

## Parole chiave (App Store, max 100 caratteri)
APE,attestato,prestazione energetica,certificazione,classe energetica,Bologna,Emilia-Romagna,casa

## Note per la revisione Apple
- Account demo: email di prova [da creare] con codice di accesso fisso abilitato solo per il revisore, oppure spiegare il login con codice via email.
- I pagamenti riguardano un servizio fisico (sopralluogo e attestato) eseguito fuori dall’app: si usa Stripe, non l’acquisto in-app (linea guida 3.1.3(e)/3.1.5).
- Cancellazione account: Home → Il tuo account → Elimina account.

## Privacy (App Store “Nutrition label” / Google “Sicurezza dei dati”)
| Dato | Raccolto | Collegato all’utente | Scopo |
|---|---|---|---|
| Email, nome, telefono | Sì | Sì | Funzionalità dell’app (contatto per il sopralluogo) |
| Indirizzo dell’immobile | Sì | Sì | Funzionalità |
| Foto e video | Sì | Sì | Funzionalità (fascicolo per il certificatore) |
| Documenti (planimetria, identità per delega) | Sì, facoltativo | Sì | Funzionalità |
| Pagamenti | Gestiti da Stripe | Sì | Acquisti |
| Posizione | No (rimossa da foto e video) | — | — |
| Tracciamento/pubblicità | No | — | — |
Crittografia in transito: sì. Cancellazione dati su richiesta: sì, dall’app.

## Google Play
- Account personale creato dopo il 13/11/2023: serve un **test chiuso con almeno 12 tester per 14 giorni** prima della produzione.
- Firma: Play App Signing + chiave di caricamento (secret `ANDROID_KEYSTORE_BASE64` ecc., vedi docs/MOBILE_RELEASE.md).
