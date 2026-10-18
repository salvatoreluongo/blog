---
title: "Come ripristinare la partizione di boot UEFI quando Windows non si avvia"
date: 2026-10-18 16:00:00 +0200
categories: [Windows, Tips e Trick]
description: "Windows non parte più per colpa della partizione EFI danneggiata? Si recupera dal Prompt dei comandi con diskpart e bcdboot: ecco la procedura passo passo."
published: true
---

Accendi il PC e invece del logo di Windows ti ritrovi davanti a un messaggio di errore di avvio, magari un laconico *"An operating system wasn't found"* o un errore legato al file **BCD**. Spesso la causa non è il disco né Windows, ma la piccola **partizione EFI** che gestisce l'avvio: se si danneggia, il computer non sa più da dove partire.

La buona notizia è che quella partizione si può ricostruire senza reinstallare nulla, lavorando dal **Prompt dei comandi** con due strumenti di Windows: `diskpart` e `bcdboot`. In questo articolo vediamo come, passo per passo.

## Prima di iniziare: attenzione

Questa procedura **formatta la partizione EFI**: è un'operazione che non si annulla. Se selezioni il volume sbagliato rischi di perdere dati. Prima di procedere:

- assicurati di aver individuato la partizione EFI giusta (è piccola, 100–300 MB, in **FAT32**);
- se i dati sul disco sono importanti e hai dubbi, fai prima un backup collegando il disco a un altro PC.

La partizione **C:** con i tuoi file e Windows **non** va toccata: noi formattiamo solo la piccola EFI.

## Cosa ti serve

- Una **chiavetta USB (o DVD) di installazione di Windows**. Se non ce l'hai, la crei da un altro computer con lo strumento ufficiale *Media Creation Tool* di Microsoft.

## Passo 1 — Aprire il Prompt dei comandi

1. Inserisci la chiavetta di Windows e avvia il PC da lì. Se non parte da sola, entra nel BIOS/UEFI (di solito con `Canc`, `F2` o `F12` all'accensione) e imposta la USB come primo dispositivo di avvio.
2. Alla schermata di installazione scegli la lingua e premi **Avanti**.
3. In basso a sinistra clicca **Ripristina il computer** (non "Installa").
4. Scegli **Risoluzione dei problemi → Prompt dei comandi**.

## Passo 2 — Trovare la partizione EFI

Avvia lo strumento di gestione dei dischi:

```
diskpart
```

Poi elenca i volumi:

```
list volume
```

Vedrai un elenco. Tipicamente:

- il volume della **chiavetta USB**;
- il volume **C:**, grande, dove c'è Windows;
- la partizione **EFI**: piccola (100–300 MB), file system **FAT32**, spesso senza lettera.

Annota il **numero** del volume EFI (nell'esempio supponiamo sia il `2`).

## Passo 3 — Assegnare una lettera alla partizione EFI

Seleziona il volume EFI (cambia il numero con quello tuo):

```
select volume 2
```

Assegnagli una lettera libera, per esempio `Z`:

```
assign letter=Z
```

Controlla che ora il volume EFI mostri la lettera Z:

```
list volume
```

Esci da diskpart e pulisci lo schermo:

```
exit
cls
```

## Passo 4 — Controllare il contenuto (facoltativo)

Prima di formattare puoi dare un'occhiata, per conferma di essere sulla partizione giusta:

```
Z:
dir
cd EFI
dir
```

Dovresti trovare le cartelle `Microsoft` e `Boot`: è la conferma che questa è davvero la partizione di avvio. Poi torna e pulisci:

```
cls
```

## Passo 5 — Formattare la partizione EFI

Ora la svuotiamo e la ricreiamo in FAT32:

```
format Z: /fs:fat32 /q
```

Quando chiede conferma, digita **S** e premi Invio. Al termine:

```
cls
```

## Passo 6 — Ricreare i file di avvio

Spostati sul disco di Windows e verifica che ci sia la cartella `Windows`:

```
C:
dir
```

Se la vedi, ricostruisci l'avvio con un solo comando:

```
bcdboot C:\Windows /s Z: /f UEFI
```

Se tutto è andato bene compare il messaggio **"Creazione dei file di avvio completata"**. Questo comando ricrea sulla partizione EFI tutto ciò che serve a far partire Windows.

## Passo 7 — Riavviare

Chiudi il Prompt, togli la chiavetta e riavvia:

```
exit
```

Se il problema era la partizione EFI, Windows ora riparte normalmente.

## Se non riparte

Non sempre la causa è solo la EFI. Se dopo la procedura il PC ancora non si avvia, da Prompt dei comandi puoi provare, nell'ordine:

```
bootrec /scanos
bootrec /rebuildbcd
```

Se neanche così si risolve, il problema è probabilmente altrove (disco in difficoltà, installazione di Windows corrotta) e conviene valutare un controllo del disco o, come ultima spiaggia, una reinstallazione conservando i file.
