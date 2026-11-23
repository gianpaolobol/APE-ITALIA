# Indice dell'API

<!-- Generato da services/api/src/tools/api-index.ts: non modificare a mano. Aggiornare con `npm run docs:api -w @ape/api`. -->

53 rotte. Autenticazione: `Authorization: Bearer <access token OIDC>`; le rotte "membro dell'organizzazione" richiedono anche `x-organization-id` e una membership attiva verificata a ogni richiesta. Limite predefinito: 120 richieste/minuto per rotta e IP. Dettagli funzionali nei documenti di area in `docs/`.

| Metodo | Percorso | Accesso | Esito | Limite | Handler |
|---|---|---|---|---|---|
| GET | `/health` | pubblico | 200 | predefinito | `HealthController.health` |
| GET | `/v1/case-summaries` | membro dell'organizzazione | 200 | predefinito | `CasesController.caseSummaries` |
| GET | `/v1/cases` | membro dell'organizzazione | 200 | predefinito | `CasesController.listCases` |
| POST | `/v1/cases` | membro dell'organizzazione | 201 | predefinito | `CasesController.createCase` |
| POST | `/v1/cases/:caseId/consents` | membro dell'organizzazione | 201 | predefinito | `EvidenceController.consent` |
| GET | `/v1/cases/:caseId/evidence` | membro dell'organizzazione | 200 | predefinito | `EvidenceController.list` |
| POST | `/v1/cases/:caseId/evidence` | membro dell'organizzazione | 201 | 30/min | `EvidenceController.upload` |
| DELETE | `/v1/cases/:id` | membro dell'organizzazione | 204 | predefinito | `CasesController.deleteCase` |
| GET | `/v1/cases/:id` | membro dell'organizzazione | 200 | predefinito | `CasesController.getCase` |
| POST | `/v1/cases/:id/cancel` | membro dell'organizzazione | 201 | predefinito | `LifecycleController.cancel` |
| GET | `/v1/cases/:id/certificate` | membro dell'organizzazione | 200 | predefinito | `CertificateController.metadata` |
| GET | `/v1/cases/:id/certificate/content` | membro dell'organizzazione | 200 | predefinito | `CertificateController.content` |
| GET | `/v1/cases/:id/evidence-requests` | membro dell'organizzazione | 200 | predefinito | `LifecycleController.listRequests` |
| POST | `/v1/cases/:id/evidence-requests/:requestId/resolve` | membro dell'organizzazione | 201 | predefinito | `LifecycleController.resolve` |
| GET | `/v1/cases/:id/inspection` | membro dell'organizzazione | 200 | predefinito | `CasesController.caseInspection` |
| POST | `/v1/cases/:id/submit` | membro dell'organizzazione | 201 | predefinito | `CasesController.submitCase` |
| POST | `/v1/cases/:id/survey` | membro dell'organizzazione | 200 | predefinito | `CasesController.saveSurvey` |
| POST | `/v1/certifier-applications` | pubblico | 201 | 5/min | `ApplicationsController.apply` |
| GET | `/v1/certifier/assignments` | certificatore verificato | 200 | predefinito | `CertifierController.list` |
| POST | `/v1/certifier/assignments/:assignmentId/evidence/:evidenceId/extract` | certificatore verificato | 201 | 20/min | `ExtractionController.extract` |
| GET | `/v1/certifier/assignments/:assignmentId/extracted-fields` | certificatore verificato | 200 | predefinito | `ExtractionController.list` |
| POST | `/v1/certifier/assignments/:assignmentId/extracted-fields/:fieldId/review` | certificatore verificato | 201 | predefinito | `ExtractionController.review` |
| POST | `/v1/certifier/assignments/:id/accept` | certificatore verificato | 201 | predefinito | `CertifierController.accept` |
| POST | `/v1/certifier/assignments/:id/call` | certificatore verificato | 201 | predefinito | `CertifierController.scheduleCall` |
| POST | `/v1/certifier/assignments/:id/certificate` | certificatore verificato | 201 | predefinito | `CertificateController.upload` |
| POST | `/v1/certifier/assignments/:id/decline` | certificatore verificato | 201 | predefinito | `CertifierController.decline` |
| GET | `/v1/certifier/assignments/:id/evidence` | certificatore verificato | 200 | predefinito | `CertifierController.evidence` |
| POST | `/v1/certifier/assignments/:id/evidence-requests` | certificatore verificato | 201 | predefinito | `LifecycleController.requestEvidence` |
| POST | `/v1/certifier/assignments/:id/evidence/:evidenceId/analyze-video` | certificatore verificato | 201 | predefinito | `CertifierController.analyzeVideo` |
| GET | `/v1/certifier/assignments/:id/evidence/:evidenceId/content` | certificatore verificato | 200 | predefinito | `CertifierController.content` |
| GET | `/v1/certifier/assignments/:id/export` | certificatore verificato | 200 | predefinito | `CertifierController.export` |
| GET | `/v1/certifier/assignments/:id/inspection` | certificatore verificato | 200 | predefinito | `CertifierController.inspection` |
| POST | `/v1/certifier/assignments/:id/inspection` | certificatore verificato | 201 | predefinito | `CertifierController.schedule` |
| POST | `/v1/certifier/assignments/:id/inspection/report` | certificatore verificato | 201 | predefinito | `CertifierController.report` |
| GET | `/v1/certifier/assignments/:id/survey` | certificatore verificato | 200 | predefinito | `CertifierController.survey` |
| POST | `/v1/certifier/assignments/:id/withdraw` | certificatore verificato | 201 | predefinito | `LifecycleController.withdraw` |
| GET | `/v1/certifier/inspection-schema` | certificatore verificato | 200 | predefinito | `CertifierController.inspectionSchema` |
| GET | `/v1/certifier/me` | certificatore verificato | 200 | predefinito | `CertifierController.me` |
| GET | `/v1/evidence/:id/content` | membro dell'organizzazione | 200 | predefinito | `EvidenceController.content` |
| GET | `/v1/invitations` | membro dell'organizzazione | 200 | predefinito | `MembersController.listInvitations` |
| POST | `/v1/invitations` | membro dell'organizzazione | 201 | predefinito | `MembersController.createInvitation` |
| DELETE | `/v1/invitations/:id` | membro dell'organizzazione | 204 | predefinito | `MembersController.revokeInvitation` |
| POST | `/v1/invitations/accept` | utente autenticato | 201 | 10/min | `MembersController.accept` |
| GET | `/v1/me` | utente autenticato | 200 | predefinito | `MeController.me` |
| GET | `/v1/members` | membro dell'organizzazione | 200 | predefinito | `MembersController.list` |
| PATCH | `/v1/members/:id` | membro dell'organizzazione | 200 | predefinito | `MembersController.update` |
| GET | `/v1/notices` | pubblico | 200 | predefinito | `EvidenceController.notices` |
| GET | `/v1/properties` | membro dell'organizzazione | 200 | predefinito | `CasesController.listProperties` |
| POST | `/v1/properties` | membro dell'organizzazione | 201 | predefinito | `CasesController.createProperty` |
| DELETE | `/v1/properties/:id` | membro dell'organizzazione | 204 | predefinito | `CasesController.deleteProperty` |
| GET | `/v1/properties/:id` | membro dell'organizzazione | 200 | predefinito | `CasesController.getProperty` |
| PATCH | `/v1/properties/:id` | membro dell'organizzazione | 200 | predefinito | `CasesController.updateProperty` |
| POST | `/v1/survey/read-photo` | pubblico | 200 | 10/min | `SurveyController.read` |
