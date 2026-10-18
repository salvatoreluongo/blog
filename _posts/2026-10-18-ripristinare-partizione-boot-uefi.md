---
title: "Come ripristinare la partizione di boot UEFI quando Windows non si avvia"
date: 2026-10-18 16:00:00 +0200
categories: [Windows]
image: /assets/img/uefi/cover.webp
description: "Windows non parte più per colpa della partizione EFI danneggiata? Si recupera dal Prompt dei comandi con bcdboot, prima senza formattare nulla: ecco la procedura passo passo."
published: true
---

Accendi il PC e invece del logo di Windows ti ritrovi davanti a un errore di avvio: un messaggio secco come *"An operating system wasn't found"* o un errore legato al file **BCD**. Spesso la causa non è il disco né Windows, ma la piccola **partizione EFI** che gestisce l'avvio: se i suoi file di boot si rovinano, il computer non sa più da dove partire.

La buona notizia è che quella partizione si può sistemare senza reinstallare nulla, lavorando dal **Prompt dei comandi** con gli strumenti di Windows `diskpart` e `bcdboot`. E, nella maggior parte dei casi, **senza nemmeno formattarla**: basta riscrivere i file di avvio. In questo articolo vediamo prima la strada più sicura e, solo se non basta, quella più drastica.

## Prima di iniziare: dal meno al più invasivo

La regola d'oro quando un PC non si avvia è procedere **per gradi**, partendo dall'operazione che non cancella niente:

1. **Primo tentativo (non distruttivo):** riscrivere i file di avvio sulla partizione EFI con `bcdboot`. Non cancella dati e nella maggior parte dei casi risolve.
2. **Solo se il primo non basta:** formattare la partizione EFI e ricrearla. Questa operazione **non si annulla**, quindi la teniamo come seconda scelta.

Due accortezze valide per tutta la procedura:

- La partizione con i tuoi file e Windows **non va mai toccata**: lavoriamo solo sulla piccola EFI (100–300 MB, in **FAT32**).
- Se i dati sul disco sono importanti e hai dubbi sulla partizione giusta, fai prima un backup collegando il disco a un altro PC.

## Cosa ti serve

- Una **chiavetta USB (o DVD) di installazione di Windows**. Se non ce l'hai, la crei da un altro computer con lo strumento ufficiale *Media Creation Tool* di Microsoft.

## Passo 1 — Aprire il Prompt dei comandi

1. Inserisci la chiavetta di Windows e avvia il PC da lì. Se non parte da sola, entra nel BIOS/UEFI (di solito con `Canc`, `F2` o `F12` all'accensione) e imposta la USB come primo dispositivo di avvio.
2. Alla schermata di installazione scegli la lingua e premi **Avanti**.
3. In basso a sinistra clicca **Ripristina il computer** (non "Installa").
4. Scegli **Risoluzione dei problemi → Prompt dei comandi**.

![Alla schermata di installazione, in basso a sinistra, clicca su "Ripristina il computer"](/blog/assets/img/uefi/01-ripristina.webp)
*Alla schermata di installazione, in basso a sinistra, clicca su "Ripristina il computer"*

![Nelle Opzioni avanzate scegli "Prompt dei comandi"](/blog/assets/img/uefi/02-prompt.webp)
*Nelle Opzioni avanzate scegli "Prompt dei comandi"*

## Passo 2 — Individuare la partizione EFI e quella di Windows

Avvia lo strumento di gestione dei dischi:

```
diskpart
```

Poi elenca i volumi:

```
list volume
```

Nell'elenco devi individuare **due** cose:

- la partizione **EFI**: piccola (100–300 MB), file system **FAT32**, spesso senza lettera. Annota il suo **numero di volume** (nell'esempio supponiamo sia il `2`);
- il volume dove è installato **Windows**: grande, in **NTFS**. Attenzione a un punto importante: **nell'ambiente di ripristino la lettera di Windows non è sempre `C:`**. Capita spesso che sia `D:`, `E:` o altro, perché la USB di installazione "ruba" lettere. Guarda la dimensione e il file system per riconoscerlo, e tienine a mente la lettera: ci servirà fra poco.

![Con "list volume" individui la partizione EFI (piccola, in FAT32) e il volume di Windows (grande, in NTFS)](/blog/assets/img/uefi/03-list-volume.webp)
*Con "list volume" individui la partizione EFI (piccola, in FAT32) e il volume di Windows (grande, in NTFS)*

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

![Dopo "select volume 2" e "assign letter=Z", la partizione EFI mostra la lettera Z](/blog/assets/img/uefi/04-assign.webp)
*Dopo "select volume 2" e "assign letter=Z", la partizione EFI mostra la lettera Z*

Esci da diskpart e pulisci lo schermo:

```
exit
cls
```

## Passo 4 — Confermare la lettera di Windows

Prima di toccare l'avvio, verifichiamo **quale lettera** corrisponde davvero a Windows. Prova la lettera che avevi annotato (qui uso `C:` come esempio) e cerca la cartella `Windows`:

```
C:
dir
```

Se tra le cartelle vedi `Windows`, `Program Files` e `Users`, è quella giusta. Se invece non la trovi, prova le altre lettere (`D:`, `E:`…) finché non individui il volume con la cartella `Windows`. Tieni a mente questa lettera: la useremo nei comandi che seguono. Puoi anche dare un'occhiata alla EFI, per conferma:

```
Z:
cd EFI
dir
```

Dovresti trovare le cartelle `Microsoft` e `Boot`. Poi pulisci:

![Dentro la partizione EFI trovi le cartelle Microsoft e Boot](/blog/assets/img/uefi/06-efi.webp)
*Dentro la partizione EFI trovi le cartelle Microsoft e Boot*

```
cls
```

## Passo 5 — Primo tentativo: riscrivere l'avvio senza formattare

Questa è la strada da provare **per prima**, perché non cancella nulla. Riscriviamo i file di avvio sulla partizione EFI partendo dalla cartella `Windows` (sostituisci `C:` con la lettera che hai confermato al passo 4):

```
bcdboot C:\Windows /s Z: /f UEFI
```

Se compare **"Creazione dei file di avvio completata"**, i file sono stati rigenerati sulla EFI.

![Il messaggio "Creazione dei file di avvio completata" conferma che è andato tutto bene](/blog/assets/img/uefi/10-bcdboot.webp)
*Il messaggio "Creazione dei file di avvio completata" conferma che è andato tutto bene*

A questo punto **riavvia e prova** (togli la chiavetta):

```
exit
```

Se Windows riparte, hai finito senza aver cancellato niente. Se invece l'errore di avvio si ripresenta, passa al passo successivo.

## Passo 6 — Se non basta: formattare la partizione EFI

Arriviamo qui **solo se** il passo 5 non ha risolto: in questo caso i file sulla EFI sono probabilmente corrotti e conviene ricrearla da zero. Ricorda che questa operazione svuota la partizione EFI e non si annulla, quindi assicurati di avere la lettera giusta (`Z:`, quella assegnata prima, **non** quella di Windows).

```
format Z: /fs:fat32 /q
```

Quando chiede conferma, digita **S** e premi Invio.

![La formattazione della partizione EFI in corso; conferma con S](/blog/assets/img/uefi/08-format.webp)
*La formattazione della partizione EFI in corso; conferma con S*

Appena formattata, ricrea di nuovo i file di avvio (sempre con la lettera di Windows confermata al passo 4):

```
bcdboot C:\Windows /s Z: /f UEFI
```

Poi riavvia:

```
exit
```

## Se ancora non riparte

Non sempre la causa è solo la EFI. Se dopo entrambi i tentativi il PC ancora non si avvia, da Prompt dei comandi puoi provare, nell'ordine:

```
bootrec /scanos
bootrec /rebuildbcd
```

Se neanche così si risolve, il problema è probabilmente altrove (disco in difficoltà, installazione di Windows corrotta) e conviene valutare un controllo del disco o, come ultima spiaggia, una reinstallazione conservando i file.
