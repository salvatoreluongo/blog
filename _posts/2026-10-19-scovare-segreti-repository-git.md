---
title: "Scova i dati sensibili nei tuoi repository Git con BetterLeaks"
date: 2026-10-19 11:00:00 +0200
categories: [Sicurezza]
image: /assets/img/betterleaks/cover.png
description: "Password e chiavi API finite per sbaglio in un commit restano nella storia del repository per sempre. Con BetterLeaks le trovi prima tu — ecco come, passo per passo."
published: true
---

Per questo articolo ho ricostruito una **vecchia versione del mio blog** e ci ho nascosto dentro quello che càpita davvero di dimenticare nel codice: una chiave di **Google Maps** in chiaro dentro lo `<script>` e un **token di deploy** per GitHub. Poi ci ho puntato contro un **secret scanner**, per vedere quanto in fretta li tira fuori. È il modo più concreto per capire un problema che riguarda chiunque scriva codice.

Il repository di prova che ho creato è pubblico, se vuoi curiosare: [**salvatoreluongo/betterleaks-demo-lab**](https://github.com/salvatoreluongo/betterleaks-demo-lab).

![La vecchia versione del blog che ho ricreato per la prova, con le chiavi nascoste nel codice](/blog/assets/img/betterleaks/blog-retro.png)
*La vecchia versione del blog che ho ricreato per la prova, con le chiavi nascoste nel codice*

Capita a tutti, prima o poi: incolli una **chiave API** o una **password** dentro un file per fare una prova veloce, fai il commit, e te ne dimentichi. Magari il giorno dopo la togli — ma è già tardi. In Git, quello che cancelli **resta nella storia** del repository: basta scorrere i vecchi commit per ritrovarlo intatto.

E non è un caso di scuola. Nel 2022 **Toyota** ha ammesso che una chiave d'accesso a un server era rimasta pubblica su GitHub per **quasi cinque anni**, finita lì nel codice di un fornitore: nel frattempo erano potenzialmente esposti i dati di circa **300.000 clienti**. Un errore di un attimo, pagato per anni.

<aside class="readalso">
  <span class="readalso-k">Potrebbe interessarti</span>
  <a href="https://blog.gitguardian.com/toyota-accidently-exposed-a-secret-key-publicly-on-github-for-five-years/" target="_blank" rel="noopener">Il caso Toyota: una chiave d'accesso rimasta pubblica su GitHub per cinque anni</a>
</aside>

E non devi nemmeno pubblicare per sbaglio: là fuori ci sono **bot** che scandagliano i repository pubblici 24 ore su 24 proprio in cerca di secret dimenticati. Una chiave esposta per pochi minuti può bastare.

La buona notizia è che puoi fare la stessa cosa **tu, prima**: passare al setaccio il tuo codice e stanare i secret prima che finiscano online. In questo articolo uso **BetterLeaks**, un **secret scanner** veloce che cerca password, token e chiavi di accesso dentro repository e cartelle.

> **Uso responsabile.** Scansiona i **tuoi** repository, o quelli per cui hai un'autorizzazione esplicita. Trovare credenziali in progetti altrui e usarle è un reato. Qui l'obiettivo è difensivo: scoprire cosa ci siamo lasciati dietro e correre ai ripari.

## Cos'è BetterLeaks

**BetterLeaks** è uno strumento a riga di comando, scritto in Go, che analizza il codice alla ricerca di **credenziali** lasciate in chiaro: chiavi di Google, token di GitHub o Slack, chiavi AWS, chiavi private… Non guarda solo i file attuali: sa leggere l'**intera cronologia** di un repository Git, e può puntare direttamente a un repository pubblico su GitHub o GitLab senza nemmeno clonarlo. I risultati si possono salvare in un file JSON.

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

## Scansione locale

Cloni (o entri in) un repository e lanci la scansione della sua **storia completa**. Aggiungi `-v` per vedere più dettagli a schermo:

```
./betterleaks git betterleaks-demo-lab
```

Per ogni secret trovato, BetterLeaks ti mostra il **tipo** (chiave Google, token GitHub…), il **file**, la **riga** e il **commit** in cui è comparso, con tanto di livello di confidenza.

![Scansione locale: BetterLeaks trova le chiavi nella storia del repository](/blog/assets/img/betterleaks/02-scan.png)
*Scansione locale della cronologia del repo &mdash; comando: `./betterleaks git betterleaks-demo-lab`*

Un punto importante: BetterLeaks scava in **tutti i commit**, quindi trova le chiavi anche nei file che hai *cancellato* in seguito — perché restano comunque nella cronologia. Se invece vuoi controllare solo i file così come sono adesso, usa la modalità cartella con `./betterleaks dir /percorso -v`.

Per conservare i risultati — cosa quasi obbligatoria in un contesto serio — esporti il report in un file JSON con `-o`:

```
./betterleaks git betterleaks-demo-lab -o report.json
```

![Il report JSON prodotto da BetterLeaks](/blog/assets/img/betterleaks/03-report.png)
*Il referto salvato su file &mdash; comando: `./betterleaks git betterleaks-demo-lab -o report.json`*

## Scansione online

La parte più comoda: puoi puntare BetterLeaks **direttamente a un repository pubblico**, senza clonarlo, passando l'URL:

```
./betterleaks github https://github.com/salvatoreluongo/betterleaks-demo-lab
```

È il modo più rapido per controllare un progetto — il tuo, o uno di cui hai la responsabilità — prima che lo faccia qualcun altro.

![Scansione online di un repository GitHub direttamente dall'URL](/blog/assets/img/betterleaks/04-github.png)
*Scansione online dall'URL del repository &mdash; comando: `./betterleaks github https://github.com/salvatoreluongo/betterleaks-demo-lab`*

## Hai trovato un secret: e adesso?

Questa è la parte che in tanti sbagliano. Se scopri una chiave esposta, **cancellare il commit non basta**: potrebbe essere già stata copiata, e comunque resta nei cloni e nei fork altrui. L'ordine giusto è:

1. **revoca o rigenera** subito la chiave sul servizio che l'ha emessa (Google, GitHub, AWS…): è l'unica mossa che la rende davvero inutile;
2. solo dopo, **ripulisci la storia** del repository (per esempio con `git filter-repo` o lo strumento BFG) per togliere il secret dai vecchi commit.

## In sintesi

Un secret in un repository è come una chiave di casa lasciata sotto lo zerbino: finché non te ne accorgi, pensi che nessuno la noti. BetterLeaks ti dà il punto di vista di chi quella chiave la cerca — e, usato prima di pubblicare, trasforma un disastro potenziale in un controllo di routine. Se vuoi confrontarlo con altri strumenti dello stesso tipo, i più noti sono **Gitleaks** e **TruffleHog**: la logica è la stessa. La regola d'oro, comunque, resta una sola: **i secret non si cancellano, si revocano**.
