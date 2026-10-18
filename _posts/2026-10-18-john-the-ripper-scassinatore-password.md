---
title: "John the Ripper: lo scassinatore di password"
date: 2026-10-18 19:00:00 +0200
categories: [Sicurezza]
image: /assets/img/john/cover.png
description: "John the Ripper mette alla prova la robustezza delle password: vediamo come recupera quelle di un file ZIP, di un PDF e di un account di sistema Linux, con rockyou come dizionario."
published: true
---

**John the Ripper** è uno degli strumenti più conosciuti nel mondo della sicurezza informatica: open source, gratuito e presente nei repository di Kali, Ubuntu e Debian. Il suo compito è uno solo, ma lo fa benissimo: **testare la robustezza delle password** provando a ricavarle dai loro hash.

In questo articolo lo proviamo in tre scenari concreti — un file **ZIP**, un **PDF** e le password di **sistema** di una macchina Linux — usando come dizionario la celebre lista `rockyou.txt`.

> **Uso responsabile.** Tutto quello che vedi qui va fatto **solo** su file e sistemi tuoi, o per cui hai un'autorizzazione esplicita. Usare questi strumenti su materiale altrui è illegale. Qui l'obiettivo è capire *quanto è fragile* una password debole, per imparare a sceglierne di migliori.

## Come funziona John the Ripper

John confronta l'hash di una password con quelli che genera a partire da una lista di tentativi. Lavora in diverse **modalità**:

- **Dizionario:** prova una ad una le parole di una wordlist. È la più usata.
  ```
  john --wordlist=passwords.txt hashfile.txt
  ```
- **Incrementale:** forza bruta tutte le combinazioni possibili. Esaustiva ma lentissima.
  ```
  john --incremental hashfile.txt
  ```
- **Singola:** genera varianti partendo da informazioni note sull'utente (nome, email…).
  ```
  john --single hashfile.txt
  ```
- **Esterna:** permette di usare script personalizzati per strategie su misura.
  ```
  john --external=custom_crack hashfile.txt
  ```

## Hash e formati supportati

Un **hash** è una stringa di lunghezza fissa ricavata dalla password con una funzione a senso unico: dalla password ottieni l'hash, ma non il contrario. Il problema è che alcuni algoritmi sono vecchi e deboli: **MD5** e **SHA-1** si prestano a collisioni e rainbow table, mentre **SHA-256/SHA-512** e soprattutto **bcrypt** e **Argon2** (pensati apposta per le password) sono molto più robusti.

Per vedere tutti i formati che John riconosce:

```
john --list=formats
```

## Scenario 1 — La password di un file ZIP

Prima si crea una cartella dove tenere gli hash, poi si estrae l'hash dal file ZIP con lo strumento `zip2john`:

```
mkdir -p hash
sudo zip2john /home/kali/Desktop/TUOFILE.zip > hash/test.txt
```

Ora si lancia l'attacco a dizionario con `rockyou.txt`:

```
john --format=zip hash/test.txt --wordlist='/home/kali/Desktop/rockyou.txt'
```

![John the Ripper decifra la password del file ZIP con la wordlist rockyou](/blog/assets/img/john/01-zip.png)
*John the Ripper decifra la password del file ZIP con la wordlist rockyou*

Nel giro di un istante, se la password è nel dizionario, viene trovata.

## Scenario 2 — La password di un file PDF

Stessa logica, strumento diverso: per i PDF si usa `pdf2john` per estrarre l'hash, poi si cracca indicando il formato `pdf`:

```
pdf2john '/home/kali/Desktop/TUOFILE.pdf' > hash-esercizio-pdf.txt
john --format=pdf hash-esercizio-pdf.txt --wordlist='/home/kali/Desktop/rockyou.txt'
```

![John the Ripper trova la password del PDF](/blog/assets/img/john/02-pdf.png)
*John the Ripper trova la password del PDF*

## Scenario 3 — Le password di sistema (Linux)

Qui entriamo nel cuore di Linux. Due file lavorano insieme:

- **`/etc/passwd`** contiene le informazioni sugli utenti (nome, UID, shell…) ed è leggibile da tutti;
- **`/etc/shadow`** contiene gli **hash** delle password ed è accessibile solo all'amministratore.

Diamo un'occhiata al primo:

```
cat /etc/passwd
```

![Il contenuto di /etc/passwd con gli utenti del sistema](/blog/assets/img/john/03-passwd.png)
*Il contenuto di `/etc/passwd` con gli utenti del sistema*

John ha bisogno dei due file **uniti** in un unico file: ci pensa lo strumento `unshadow`, che va eseguito da amministratore:

```
sudo unshadow /etc/passwd /etc/shadow > pwdkali.txt
```

![unshadow unisce passwd e shadow in un solo file](/blog/assets/img/john/04-unshadow.png)
*`unshadow` unisce `passwd` e `shadow` in un solo file*

A questo punto si avvia l'analisi indicando il formato `crypt`:

```
john --format=crypt --wordlist='/home/kali/Desktop/rockyou.txt' pwdkali.txt
```

![John recupera la password dell'utente di sistema](/blog/assets/img/john/05-crypt.png)
*John recupera la password dell'utente di sistema*

Dopo un po' di lavoro (gli hash di sistema sono più lenti da provare, di proposito), la password dell'utente viene recuperata.

## La morale: perché conta per te

Se John trova una password in pochi secondi, è perché quella password era **nel dizionario** o troppo semplice. La difesa non è un segreto:

- password **lunghe** (meglio una *passphrase* di più parole che un breve groviglio di simboli);
- **diverse** per ogni servizio, gestite con un password manager;
- dove possibile, **autenticazione a due fattori**, così l'hash da solo non basta.

John the Ripper non è magia: è un promemoria, molto concreto, di quanto vale una password fatta bene.
