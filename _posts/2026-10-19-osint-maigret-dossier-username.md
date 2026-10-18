---
title: "OSINT: da un solo username a un dossier digitale con Maigret"
date: 2026-10-19 10:00:00 +0200
categories: [Sicurezza, OSINT]
image: /assets/img/maigret/cover.png
description: "Con un solo nome utente, Maigret cerca su migliaia di siti e ricostruisce l'impronta digitale di una persona. Vediamo come funziona e, soprattutto, cosa ci insegna sulla nostra privacy."
fonte: https://hackers-arise.com/open-source-intelligence-osint-turn-one-username-into-a-full-digital-dossier-with-maigret/
fonte_titolo: "Turn One Username into a Full Digital Dossier with Maigret"
fonte_nome: "Hackers Arise"
published: false
---

<!--
  BOZZA — non ancora pubblicata.
  Da fare prima di pubblicare:
  1) provare i comandi su Kali e aggiornarli se serve (verifica con `maigret --help`);
  2) aggiungere le TUE schermate nella cartella  assets/img/maigret/  con questi nomi:
     cover.png, 01-help.png, 02-base.png, 03-site.png, 04-tags.png,
     05-permute.png, 06-html.png, 07-graph.png, 08-ai.png
  3) controllare il flag del grafo (nell'articolo originale era mostrato solo in foto);
  4) quando è pronto, cambiare  published: false  in  published: true.
-->

Ogni volta che scegliamo un **nome utente** lasciamo una traccia. Lo riusiamo su un forum, su GitHub, su un social, su una vecchia piattaforma dimenticata — e senza accorgercene costruiamo un filo che collega account anche molto lontani tra loro. L'**OSINT** (Open-Source Intelligence) è l'arte di seguire quel filo usando solo informazioni pubbliche.

In questo articolo provo **Maigret**, uno strumento che parte da un singolo username e, in pochi minuti, ricostruisce una mappa di dove quella persona è presente online. L'ho testato in prima persona; alla fine ragioniamo su cosa significa dal lato di chi si vuole **difendere**.

> **Uso responsabile.** Maigret lavora solo su dati già pubblici, ma va usato **su te stesso** o con un'autorizzazione esplicita (per esempio in un'attività di security assessment concordata). Profilare una persona a sua insaputa è un'altra cosa, e in molti casi è illegale. Qui lo uso per capire **quanto siamo esposti** e come ridurre la nostra impronta.

## Cos'è Maigret

**Maigret** è uno strumento gratuito e open source, scritto in Python, che cerca gli account collegati a un nome utente. I numeri rendono l'idea:

- conosce **oltre 3.000 siti** (social, forum, piattaforme di coding e altro); di default controlla i **500 più popolari**;
- non si limita a dire "l'account esiste": quando può, **legge la pagina pubblica del profilo** ed estrae nomi, link e altri username;
- fa una **ricerca ricorsiva**: con i dati appena trovati parte a cercare altri profili, allargando il cerchio;
- esporta i risultati in **HTML, PDF, CSV, TXT o JSON**;
- ha una **modalità AI** opzionale che genera un riassunto di quello che ha trovato.

## Maigret o Sherlock?

Se hai già sentito parlare di **Sherlock**, la differenza è questa: Sherlock è veloce e verifica *se* un username esiste su un elenco di siti; Maigret va più a fondo e prova a *capire chi c'è dietro*.

| | Sherlock | Maigret |
|---|---|---|
| Obiettivo | Verifica rapida | Indagine più approfondita |
| Siti coperti | Alcune centinaia | Oltre 3.000 |
| Estrae dati dai profili | No | Sì |
| Ricerca ricorsiva | No | Sì |
| Formati di report | Essenziali | HTML, PDF, CSV, TXT, JSON |
| Adatto a | Controlli lampo | Ricerche dettagliate |

## Installazione su Kali

Maigret si installa in un ambiente virtuale Python, così non "sporca" il sistema:

```
git clone https://github.com/soxoj/maigret && cd maigret
python3 -m venv .venv
source .venv/bin/activate
pip3 install .
```

Per verificare che sia a posto, apri l'aiuto in linea:

```
maigret --help
```

![La schermata di aiuto di Maigret con tutte le opzioni disponibili](/blog/assets/img/maigret/01-help.png)
*La schermata di aiuto di Maigret con tutte le opzioni disponibili*

## Uso: dalla ricerca di base a quella mirata

### Ricerca di base

Il comando minimo è semplicemente lo strumento seguito dallo username. Maigret controlla i 500 siti più popolari, in ordine di diffusione:

```
maigret username
```

![La scansione di base in corso sul terminale](/blog/assets/img/maigret/02-base.png)
*La scansione di base in corso sul terminale*

Per spingere la ricerca su **tutti** i siti del database (più lenta, ma più completa) si aggiunge `-a`:

```
maigret username -a
```

### Limitare a un sito

Se ti interessa un solo servizio, per esempio GitHub, lo isoli con `--site`:

```
maigret username --site GitHub
```

![Il risultato filtrato su un singolo sito, con i tag trovati](/blog/assets/img/maigret/03-site.png)
*Il risultato filtrato su un singolo sito, con i tag trovati*

### Filtrare per tag

Maigret etichetta i siti con dei **tag** (per esempio `coding`, `social`…). Puoi usarli per restringere il campo a una categoria:

```
maigret username --tags coding
```

![I risultati filtrati per tag](/blog/assets/img/maigret/04-tags.png)
*I risultati filtrati per tag*

### Provare le varianti del nome

Spesso una persona non usa sempre lo stesso identico username: `mario.rossi`, `mariorossi`, `m.rossi`… Con `--permute` Maigret genera e cerca queste combinazioni partendo da nome e cognome:

```
maigret --permute nome cognome
```

![I risultati della permutazione di nome e cognome](/blog/assets/img/maigret/05-permute.png)
*I risultati della permutazione di nome e cognome*

## I report: HTML e grafo

A terminale i risultati scorrono veloci: per leggerli con calma conviene esportarli. Il formato più comodo è l'**HTML**, un file autonomo con i dati organizzati e le immagini dei profili:

```
maigret username --html
```

![Il report HTML generato da Maigret](/blog/assets/img/maigret/06-html.png)
*Il report HTML generato da Maigret*

Maigret può anche rappresentare i risultati come un **grafo**, in cui si vedono a colpo d'occhio le connessioni tra i vari account trovati. È la vista che rende più evidente il "filo" di cui parlavamo all'inizio.

![La visualizzazione a grafo delle connessioni tra gli account](/blog/assets/img/maigret/07-graph.png)
*La visualizzazione a grafo delle connessioni tra gli account*

## La modalità AI (opzionale)

Con il flag `--ai`, Maigret invia i risultati a un modello linguistico che ne scrive un **riassunto** in linguaggio naturale. Per usarla serve una chiave API: si configura creando il file `~/.maigret/settings.json`, per esempio così (con OpenRouter):

```
{
  "openai_api_key": "LA-TUA-CHIAVE",
  "openai_api_base_url": "https://openrouter.ai/api/v1",
  "openai_model": "openai/gpt-4o-mini"
}
```

Poi basta aggiungere il flag:

```
maigret username --ai
```

![Il riassunto generato dalla modalità AI](/blog/assets/img/maigret/08-ai.png)
*Il riassunto generato dalla modalità AI*

Occhio a non mettere **mai** una chiave vera dentro screenshot o file pubblici.

## La lezione: quanto siamo esposti

La cosa che colpisce provando Maigret su sé stessi non è la tecnica, ma il **risultato**: da un singolo nome utente può uscire una mappa sorprendente della nostra vita online, mettendo in fila account che credevamo scollegati. È lo stesso lavoro che potrebbe fare chiunque, con uno strumento gratuito.

Da qui qualche buona abitudine per ridurre la propria impronta:

- **username diversi** per contesti diversi: tenere separate l'identità professionale, quella personale e quella "usa e getta" spezza il filo che collega i profili;
- **ripulire i vecchi account** che non usi più, soprattutto quelli pubblici;
- controllare le **impostazioni di privacy** dei profili che vuoi tenere, così che le pagine pubbliche espongano il meno possibile;
- ricordare che le informazioni, una volta pubbliche, è difficile farle sparire del tutto: la vera difesa è **decidere in anticipo** cosa rendere pubblico.

Maigret, in fondo, è utilissimo proprio per questo: usarlo su sé stessi è il modo più rapido per vedere il proprio profilo con gli occhi di chi ci cerca — e correre ai ripari.
