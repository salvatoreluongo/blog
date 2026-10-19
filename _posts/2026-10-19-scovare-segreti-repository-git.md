---
title: "Scova i dati sensibili nei tuoi repository Git prima che lo faccia qualcun altro"
date: 2026-10-19 11:00:00 +0200
categories: [Sicurezza]
image: /assets/img/git-secrets/cover.png
description: "Password e chiavi API finite per sbaglio in un commit restano nella storia del repository per sempre. Con Gitleaks e TruffleHog le trovi prima tu — ecco come."
fonte: https://www.hackerjournal.it/
fonte_titolo: "Scova i dati sensibili nei repository GIT"
fonte_nome: "Hacker Journal"
published: false
---

<!--
  BOZZA — non ancora pubblicata.
  Da fare prima di pubblicare:
  1) provare i comandi su Kali e aggiornarli se serve: Gitleaks e TruffleHog cambiano
     ogni tanto la sintassi dei sottocomandi — verifica con `gitleaks --help` e `trufflehog --help`;
  2) creare un repo di prova con qualche finta chiave (es. AKIA..., una password), così gli screenshot
     mostrano dei "ritrovamenti" SENZA usare segreti veri;
  3) aggiungere le TUE schermate in  assets/img/git-secrets/  con questi nomi:
     cover.png, 01-gitleaks-scan.png, 02-gitleaks-report.png,
     03-trufflehog-scan.png, 04-trufflehog-verified.png, 05-precommit.png
  4) quando è pronto, cambiare  published: false  in  published: true.
-->

Capita a tutti, prima o poi: incolli una **chiave API** o una **password** dentro un file per fare una prova veloce, fai il commit, e te ne dimentichi. Magari il giorno dopo la togli — ma è già tardi. In Git, quello che cancelli **resta nella storia** del repository: basta scorrere i vecchi commit per ritrovarlo intatto.

E non devi nemmeno sbagliare pubblicando su GitHub: là fuori ci sono **bot** che scandagliano i repository pubblici 24 ore su 24 proprio in cerca di segreti dimenticati. Una chiave AWS esposta per pochi minuti può bastare.

La buona notizia è che gli stessi strumenti che usano loro per trovarli, puoi usarli **tu, prima**, per fare pulizia. In questo articolo provo i due più noti: **Gitleaks** e **TruffleHog**.

> **Uso responsabile.** Scansiona i **tuoi** repository, o quelli per cui hai un'autorizzazione esplicita. Trovare segreti in progetti altrui e usarli è un reato. Qui l'obiettivo è difensivo: scoprire cosa ci siamo lasciati dietro e correre ai ripari.

## Gitleaks o TruffleHog?

I due strumenti si somigliano ma hanno due anime diverse:

| | Gitleaks | TruffleHog |
|---|---|---|
| Come cerca | Regole ed entropia (schemi di chiavi note) | Regole + oltre 800 "detector" per servizi noti |
| Verifica i segreti | No | **Sì**: controlla se la chiave è ancora valida |
| Punto di forza | Veloce, perfetto in CI e nei pre-commit | Approfondito, distingue i segreti *vivi* |
| Ideale per | Bloccare i leak prima del commit | Capire quanto sei davvero esposto |

In pratica si usano **insieme**: Gitleaks come rete di sicurezza automatica, TruffleHog per l'analisi vera.

## Installazione su Kali

Entrambi sono nei repository di Kali:

```
sudo apt update
sudo apt install -y gitleaks trufflehog
```

Verifica che rispondano:

```
gitleaks version
trufflehog --version
```

## Gitleaks: una scansione della storia del repo

Spostati nella cartella di un repository Git e lancia la scansione. Gitleaks analizza **tutta la cronologia**, non solo i file attuali:

```
cd /percorso/del/tuo/repo
gitleaks detect --source . --verbose
```

Per ogni segreto trovato ti mostra il **tipo** (chiave AWS, token, password…), il **file**, la **riga** e il **commit** in cui è comparso.

![Gitleaks segnala i segreti trovati nella storia del repository](/blog/assets/img/git-secrets/01-gitleaks-scan.png)
*Gitleaks segnala i segreti trovati nella storia del repository*

Per tenere un referto da consultare con calma, esportalo in un file:

```
gitleaks detect --source . --report-path gitleaks-report.json
```

![Il report JSON prodotto da Gitleaks](/blog/assets/img/git-secrets/02-gitleaks-report.png)
*Il report JSON prodotto da Gitleaks*

## TruffleHog: trovare i segreti ancora "vivi"

TruffleHog fa un passo in più: non solo trova le potenziali chiavi, ma **prova a verificarle**, dicendoti quali sono ancora valide (quindi davvero pericolose). Si può puntare su un repository locale:

```
trufflehog git file://. 
```

![TruffleHog analizza il repository alla ricerca di credenziali](/blog/assets/img/git-secrets/03-trufflehog-scan.png)
*TruffleHog analizza il repository alla ricerca di credenziali*

Oppure direttamente su un repository remoto su GitHub, senza nemmeno clonarlo:

```
trufflehog github --repo=https://github.com/UTENTE/REPO
```

Il flag più utile è `--only-verified`: mostra **solo** i segreti che TruffleHog è riuscito a confermare come ancora attivi. Sono quelli da revocare per primi.

```
trufflehog git file://. --only-verified
```

![Con --only-verified restano solo i segreti confermati come ancora validi](/blog/assets/img/git-secrets/04-trufflehog-verified.png)
*Con `--only-verified` restano solo i segreti confermati come ancora validi*

## Prevenire: il controllo prima del commit

Trovare i segreti è metà del lavoro; l'altra metà è **non lasciarceli più**. Gitleaks si aggancia come **hook pre-commit**: a ogni commit controlla le modifiche e, se trova un segreto, **blocca** l'operazione prima che finisca nella storia.

```
gitleaks protect --staged --verbose
```

Integrandolo nei `pre-commit` del progetto (o nella pipeline CI), la rete di sicurezza diventa automatica per tutto il team.

![L'hook pre-commit blocca il commit quando trova un segreto](/blog/assets/img/git-secrets/05-precommit.png)
*L'hook pre-commit blocca il commit quando trova un segreto*

## Hai trovato un segreto: e adesso?

Questa è la parte che in tanti sbagliano. Se scopri una chiave esposta, **cancellare il commit non basta**: potrebbe essere già stata copiata, e comunque resta nei cloni e nei fork altrui. L'ordine giusto è:

1. **revoca o rigenera** subito la chiave sul servizio che l'ha emessa (AWS, GitHub, Stripe…): è l'unica mossa che la rende davvero inutile;
2. solo dopo, **ripulisci la storia** del repository (per esempio con `git filter-repo` o lo strumento BFG) per togliere il segreto dai vecchi commit;
3. aggiorna i collaboratori, perché dovranno riallineare i loro cloni.

## In sintesi

Un segreto in un repository è come una chiave di casa lasciata sotto lo zerbino: finché non te ne accorgi, pensi che nessuno la noti. Gitleaks e TruffleHog ti danno il punto di vista di chi quella chiave la cerca — e, usati prima di pubblicare, trasformano un disastro potenziale in un controllo di routine. La regola d'oro resta una sola: **i segreti non si cancellano, si revocano**.
