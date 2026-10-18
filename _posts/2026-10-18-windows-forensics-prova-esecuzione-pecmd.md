---
title: "Windows Forensics: la prova d'esecuzione di un programma con PECmd"
date: 2026-10-18 18:00:00 +0200
categories: [Sicurezza]
image: /assets/img/pecmd/cover.png
description: "Un programma è stato eseguito su quel PC? Quante volte e quando? I file Prefetch di Windows lo sanno, e con PECmd di Eric Zimmerman si leggono in pochi secondi."
published: true
---

In un'analisi forense, le tracce che un sistema lascia dietro di sé valgono più di mille parole. Windows, in particolare, registra un'enorme quantità di informazioni su ciò che succede al suo interno, spesso senza che l'utente ne sia consapevole. Una di queste tracce è la **prova d'esecuzione**: la possibilità di dimostrare che un certo programma è stato lanciato, quante volte e in quali momenti.

In questo articolo vediamo come ottenerla a partire dai file **Prefetch**, usando **PECmd**, uno strumento della nota suite di Eric Zimmerman, punto di riferimento per chi fa Windows forensics.

## Cos'è il Prefetch

Il **Prefetch** è una funzione di Windows nata con Windows XP per un motivo tutt'altro che investigativo: **velocizzare l'avvio dei programmi**. Ogni volta che esegui un'applicazione, Windows registra quali file e librerie carica nei primi secondi e li annota in un piccolo file con estensione `.pf`, dentro la cartella `C:\Windows\Prefetch`. Alla successiva esecuzione, il sistema usa quelle informazioni per precaricare il necessario e partire più in fretta.

Per noi, però, quel file diventa qualcosa di molto più interessante: la **firma del fatto che quel programma è stato eseguito**.

## Perché è importante in forensics

Dal punto di vista investigativo, il Prefetch è una miniera. Da quei file possiamo:

- **ricostruire l'attività dell'utente**, perché ogni `.pf` conferma che un dato eseguibile è stato avviato, con tanto di numero di esecuzioni;
- **individuare l'attività di un attaccante**, per esempio un eseguibile malevolo lanciato sulla macchina, anche se poi è stato cancellato: il Prefetch può restare;
- **costruire una timeline**, incrociando le date di creazione e di ultimo accesso con gli orari di esecuzione registrati.

## Cos'è PECmd

**PECmd** è uno strumento open source da riga di comando, scritto da Eric Zimmerman, che legge e interpreta i file Prefetch. Al posto di un dato grezzo e illeggibile, ci restituisce in chiaro il percorso dell'eseguibile, il **numero di esecuzioni**, gli **orari** delle ultime volte in cui è stato lanciato e le informazioni sui volumi coinvolti.

Per funzionare richiede il **.NET Framework 4.5 o successivo**, praticamente sempre presente su un Windows moderno.

## Esempio pratico

### 1. Scaricare lo strumento

PECmd si scarica dal sito degli strumenti di Eric Zimmerman. Nella tabella cerca la riga **PECmd** e scarica la versione che ti serve.

![Nella tabella degli strumenti di Eric Zimmerman, scarica PECmd](/blog/assets/img/pecmd/01-ez-tools.png)
*Nella tabella degli strumenti di Eric Zimmerman, scarica PECmd*

Estrai l'archivio in una cartella (nel mio caso sul Desktop) e apri un **Prompt dei comandi come amministratore**. Spostati nella cartella dello strumento e lancialo senza argomenti per vederne le opzioni:

```
cd C:\Users\Salvatore Luongo\Desktop\PECmd
PECmd.exe
```

### 2. Dove vivono i file Prefetch

I file Prefetch si trovano tutti in `C:\Windows\Prefetch` e hanno estensione `.pf`. Il nome segue uno schema preciso: il **nome dell'eseguibile**, un trattino e un **codice esadecimale**. Quel codice è un hash calcolato a partire dal percorso da cui il programma è stato avviato (la funzione di hash cambia a seconda della versione di Windows).

![La cartella C:\Windows\Prefetch contiene un file .pf per ogni programma eseguito](/blog/assets/img/pecmd/02-prefetch-folder.png)
*La cartella `C:\Windows\Prefetch` contiene un file `.pf` per ogni programma eseguito*

Prendiamo come esempio la Calcolatrice di Windows:

![Il file Prefetch della Calcolatrice: CALCULATORAPP.EXE-0152CFED.pf](/blog/assets/img/pecmd/03-calculator-pf.png)
*Il file Prefetch della Calcolatrice: `CALCULATORAPP.EXE-0152CFED.pf`*

### 3. Analizzare un singolo file

Per leggere un file Prefetch si usa l'opzione `-f` seguita dal percorso del `.pf`:

```
PECmd.exe -f C:\Windows\Prefetch\CALCULATORAPP.EXE-0152CFED.pf
```

Il risultato è tutto quello che ci serve, in chiaro:

![L'output di PECmd: nome dell'eseguibile, numero di esecuzioni, orari e volumi](/blog/assets/img/pecmd/04-pecmd-output.png)
*L'output di PECmd: nome dell'eseguibile, numero di esecuzioni, orari e volumi*

Nell'esempio PECmd ci dice che la Calcolatrice:

- è stata **eseguita 7 volte** (`Run count: 7`);
- è stata lanciata l'**ultima volta** il 2 aprile 2024 alle 13:41 (`Last run`);
- riporta anche gli **orari delle esecuzioni precedenti** (`Other run times`), perfetti per costruire una timeline;
- mostra le **date di creazione, modifica e ultimo accesso** del file Prefetch e le **informazioni sul volume** (numero di serie, data di creazione).

Se vuoi conservare il risultato — cosa quasi obbligatoria in un contesto forense — puoi esportarlo in CSV aggiungendo `--csv` e una cartella di destinazione:

```
PECmd.exe -f C:\Windows\Prefetch\CALCULATORAPP.EXE-0152CFED.pf --csv C:\Temp
```

### 4. Analizzare l'intera cartella

Quando non cerchi un singolo programma ma vuoi una fotografia di **tutto** ciò che è stato eseguito, usa l'opzione `-d` (directory) puntando all'intera cartella Prefetch, sempre con esportazione in CSV:

```
PECmd.exe -d C:\Windows\Prefetch --csv C:\Temp
```

In pochi secondi ottieni un foglio con l'elenco completo dei programmi eseguiti, pronto da ordinare e filtrare.

## Qualche nota utile

- Il Prefetch è **attivo per impostazione predefinita sulle workstation**, ma **non sui server**, dove di solito è disabilitato.
- C'è un **limite al numero di file** conservati: da Windows XP a Windows 7 erano al massimo **128**, da Windows 8 in poi si sale fino a **1024**. Oltre quel numero, i file più vecchi vengono sovrascritti: per questo il Prefetch racconta l'attività *recente*, non tutta la storia del sistema.
- L'assenza di un file Prefetch **non** prova che un programma non sia mai stato eseguito: potrebbe essere stato rimosso, oppure il Prefetch potrebbe essere disattivato.

Con un solo comando, insomma, siamo passati da un file binario indecifrabile a una prova concreta: *quel programma è stato eseguito, 7 volte, e l'ultima è stata il 2 aprile alle 13:41*. È questo il bello della Windows forensics.
