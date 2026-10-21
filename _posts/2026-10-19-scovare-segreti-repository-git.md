---
title: "Scova i dati sensibili nei tuoi repository Git con BetterLeaks"
date: 2026-10-19 11:00:00 +0200
categories: [Sicurezza]
image: /assets/img/betterleaks/cover.png
description: "Password e chiavi API finite per sbaglio in un commit restano nella storia del repository per sempre. Con BetterLeaks le trovi prima tu — ecco come, passo per passo."
fonte: https://hackerjournal.it/15684/scova-i-dati-sensibili-nei-repository-git/
fonte_titolo: "Scova i dati sensibili nei repository GIT"
fonte_nome: "Hacker Journal"
published: false
---

<!--
  BOZZA — non ancora pubblicata.
  Da fare prima di pubblicare:
  1) provare i comandi su Kali: BetterLeaks richiede una versione recente di Go;
     al primo `make build` Go scarica da solo la toolchain giusta (serve internet).
     Conferma la sintassi con `./betterleaks --help`.
  2) usa il repo di prova "nova-shop-api" (quello con le chiavi FINTE) per gli screenshot;
  3) metti le TUE schermate in  assets/img/betterleaks/  con questi nomi:
     cover.png, 01-build.png, 02-scan.png, 03-report.png, 04-github.png
  4) quando è pronto, cambia  published: false  in  published: true.
-->

Qualche sera fa ho ripescato una **vecchia versione del mio blog** — roba stile 2003, tabelle, contatore delle visite e "sito in costruzione". Curiosando nel codice, ci ho trovato di tutto: la chiave delle Google Maps in chiaro dentro lo `<script>`, un token per il deploy su GitHub, perfino le chiavi della newsletter e dell'invio email. Tutto lì, in bella vista, dentro una pagina HTML. È il promemoria perfetto di un problema che riguarda chiunque scriva codice.

Capita a tutti, prima o poi: incolli una **chiave API** o una **password** dentro un file per fare una prova veloce, fai il commit, e te ne dimentichi. Magari il giorno dopo la togli — ma è già tardi. In Git, quello che cancelli **resta nella storia** del repository: basta scorrere i vecchi commit per ritrovarlo intatto. Si sono visti casi di chiavi d'accesso a un server rimaste pubbliche su GitHub per **anni**, dentro il codice di un fornitore, senza che nessuno se ne accorgesse.

E non devi nemmeno pubblicare per sbaglio: là fuori ci sono **bot** che scandagliano i repository pubblici 24 ore su 24 proprio in cerca di segreti dimenticati. Una chiave esposta per pochi minuti può bastare.

La buona notizia è che puoi fare la stessa cosa **tu, prima**: passare al setaccio il tuo codice e stanare i segreti prima che finiscano online. In questo articolo uso **BetterLeaks**, uno scanner veloce che cerca password, token e chiavi di accesso dentro repository e cartelle.

> **Uso responsabile.** Scansiona i **tuoi** repository, o quelli per cui hai un'autorizzazione esplicita. Trovare segreti in progetti altrui e usarli è un reato. Qui l'obiettivo è difensivo: scoprire cosa ci siamo lasciati dietro e correre ai ripari.

## Cos'è BetterLeaks

**BetterLeaks** è uno strumento a riga di comando, scritto in Go, che analizza il codice alla ricerca di **credenziali** lasciate in chiaro: chiavi AWS, token di GitHub o Slack, chiavi Stripe, chiavi private… Non guarda solo i file attuali: sa leggere l'**intera cronologia** di un repository Git, e può puntare direttamente a un repository pubblico su GitHub o GitLab senza nemmeno clonarlo. I risultati si esportano in JSON, CSV o Markdown.

## Installazione su Kali

BetterLeaks si compila dai sorgenti. Servono `git`, `go` e `make`:

```
sudo apt update
sudo apt install -y git golang-go make
git clone https://github.com/betterleaks/betterleaks
cd betterleaks
make build
```

Nota: BetterLeaks richiede una versione di Go abbastanza recente; al primo `make build` Go scarica da solo la toolchain corretta, quindi serve la connessione a internet. A fine compilazione trovi l'eseguibile `betterleaks` nella cartella. Verifica che risponda:

```
./betterleaks version
```

## Scansionare la cronologia di un repository

Spostati nella cartella di un repository e lancia la scansione della **storia completa**:

```
./betterleaks git /percorso/del/tuo/repo
```

Per ogni segreto trovato, BetterLeaks ti mostra il **tipo** (chiave AWS, token GitHub, chiave privata…), il **file**, la **riga** e il **commit** in cui è comparso. Aggiungi `-v` per vedere più dettagli a schermo.

![BetterLeaks segnala i segreti trovati nella storia del repository](/blog/assets/img/betterleaks/02-scan.png)
*BetterLeaks segnala i segreti trovati nella storia del repository*

Un punto importante: BetterLeaks scava in **tutti i commit**, quindi trova i segreti anche nei file che hai *cancellato* in seguito — perché restano comunque nella cronologia. Se invece vuoi controllare solo i file così come sono adesso, usa la modalità cartella:

```
./betterleaks dir /percorso -v
```

## Salvare un referto

In un contesto reale conviene conservare i risultati. Con `-r` esporti il report in un file (JSON, CSV o Markdown a seconda dell'estensione):

```
./betterleaks git . -r report.json
```

![Il report prodotto da BetterLeaks](/blog/assets/img/betterleaks/03-report.png)
*Il report prodotto da BetterLeaks*

## Scansionare un repository GitHub al volo

La parte più comoda: puoi puntare BetterLeaks **direttamente a un repository pubblico**, senza clonarlo, passando l'URL:

```
./betterleaks github https://github.com/UTENTE/REPO
```

È il modo più rapido per controllare un progetto — il tuo, o uno di cui hai la responsabilità — prima che lo faccia qualcun altro.

![La scansione di un repository GitHub direttamente dall'URL](/blog/assets/img/betterleaks/04-github.png)
*La scansione di un repository GitHub direttamente dall'URL*

## Hai trovato un segreto: e adesso?

Questa è la parte che in tanti sbagliano. Se scopri una chiave esposta, **cancellare il commit non basta**: potrebbe essere già stata copiata, e comunque resta nei cloni e nei fork altrui. L'ordine giusto è:

1. **revoca o rigenera** subito la chiave sul servizio che l'ha emessa (AWS, GitHub, Stripe…): è l'unica mossa che la rende davvero inutile;
2. solo dopo, **ripulisci la storia** del repository (per esempio con `git filter-repo` o lo strumento BFG) per togliere il segreto dai vecchi commit;
3. aggiorna i collaboratori, perché dovranno riallineare i loro cloni.

## In sintesi

Un segreto in un repository è come una chiave di casa lasciata sotto lo zerbino: finché non te ne accorgi, pensi che nessuno la noti. BetterLeaks ti dà il punto di vista di chi quella chiave la cerca — e, usato prima di pubblicare, trasforma un disastro potenziale in un controllo di routine. Se vuoi confrontarlo con altri strumenti dello stesso tipo, i più noti sono **Gitleaks** e **TruffleHog**: la logica è la stessa. La regola d'oro, comunque, resta una sola: **i segreti non si cancellano, si revocano**.
