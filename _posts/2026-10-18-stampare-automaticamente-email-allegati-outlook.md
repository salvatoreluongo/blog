---
title: "Stampare in automatico le email e gli allegati in arrivo su Outlook"
date: 2026-10-18 17:00:00 +0200
categories: [Outlook, Tips e Trick]
description: "Una macro VBA che stampa da sola ogni email in arrivo e i suoi allegati, con la parte che di solito manca: come farla partire all'arrivo della posta."
fonte: "https://www.salvatoreluongo.it/come-stampare-automaticamente-une-mail-e-i-suoi-allegati-in-arrivo-in-outlook/"
fonte_titolo: "Come stampare automaticamente un'e-mail e i suoi allegati in arrivo in Outlook"
fonte_nome: "salvatoreluongo.it"
published: true
---

Ci sono uffici in cui ogni email che arriva va finire su carta: un ordine da evadere, una conferma da protocollare, un documento da firmare. Farlo a mano, una stampa alla volta, è una di quelle attività che mangiano tempo senza dare niente in cambio.

In questo articolo vediamo come far sì che Outlook stampi **da solo** ogni email in arrivo e i suoi allegati, con una piccola macro. È la stessa procedura che avevo già descritto tempo fa, ma con un pezzo che allora avevo lasciato fuori e che è quello che fa davvero la differenza: **come far partire la macro automaticamente** quando arriva la posta.

## A chi serve davvero

Prima di metterci mano, conviene capire se è il caso. Questa automazione ha senso quando:

- ricevi documenti che **devono** passare per la stampa (reception, ordini, laboratori, segreterie);
- la casella che usi è dedicata o comunque filtrata, così non ti ritrovi a stampare anche lo spam;
- hai una stampante sempre accesa e con carta, perché la macro non chiede conferma: stampa e basta.

Se invece ricevi decine di email miste, meglio limitarla a una cartella o a un mittente preciso, come vediamo più avanti.

## Come funziona

L'idea è semplice: Outlook permette di scrivere piccole automazioni in **VBA** (lo stesso linguaggio delle macro di Office). Noi scriviamo una macro che, ricevuta un'email:

1. salva i suoi allegati in una cartella temporanea;
2. manda ogni allegato alla stampante con il comando "stampa" di Windows;
3. salta gli allegati "finti", cioè le immagini incorporate nella firma o nel corpo del messaggio, che altrimenti verrebbero stampate come fogli inutili.

## Passo 1 — Aprire l'editor delle macro

Apri Outlook e premi **Alt + F11**: si apre l'editor di Visual Basic. Nella colonna a sinistra espandi *Project1 → Microsoft Outlook Objects* e fai doppio clic su **ThisOutlookSession**.


## Passo 2 — Far partire la macro all'arrivo della posta

Questo è il pezzo chiave. Perché la stampa sia davvero automatica, Outlook deve "accorgersi" di ogni nuova email. Incolla in cima a **ThisOutlookSession** questo codice, che si aggancia alla Posta in arrivo:

```vba
Private WithEvents ElementiPostaInArrivo As Outlook.Items

Private Sub Application_Startup()
    Dim ns As Outlook.NameSpace
    Set ns = Application.GetNamespace("MAPI")
    Set ElementiPostaInArrivo = ns.GetDefaultFolder(olFolderInbox).Items
End Sub

Private Sub ElementiPostaInArrivo_ItemAdd(ByVal Item As Object)
    If TypeName(Item) = "MailItem" Then
        StampaAllegati Item
    End If
End Sub
```

Da ora, ogni volta che arriva un messaggio, Outlook chiama la nostra macro `StampaAllegati`.

## Passo 3 — La macro che stampa

Sotto il codice precedente, incolla la macro vera e propria:

```vba
Private Sub StampaAllegati(ByVal Messaggio As Outlook.MailItem)
    On Error GoTo Errore
    If Messaggio.Attachments.Count = 0 Then Exit Sub

    Dim cartella As String
    cartella = Environ("TEMP") & "\ATMP_" & Format(Now, "yyyymmdd_hhnnss") & "\"
    MkDir cartella

    Dim shell As Object
    Set shell = CreateObject("Shell.Application")

    Dim allegato As Outlook.Attachment
    For Each allegato In Messaggio.Attachments
        If Not AllegatoIncorporato(Messaggio, allegato) Then
            Dim percorso As String
            percorso = cartella & allegato.FileName
            allegato.SaveAsFile percorso
            shell.Namespace(cartella).ParseName(allegato.FileName).InvokeVerb "Stampa"
        End If
    Next

    Exit Sub
Errore:
    MsgBox "Errore " & Err.Number & ": " & Err.Description, vbExclamation
End Sub
```

E infine la funzione che riconosce gli allegati incorporati, così da non stampare loghi e immagini della firma:

```vba
Private Function AllegatoIncorporato(ByVal Messaggio As Outlook.MailItem, _
                                     ByVal allegato As Outlook.Attachment) As Boolean
    Dim cid As String
    On Error Resume Next
    cid = allegato.PropertyAccessor.GetProperty( _
          "http://schemas.microsoft.com/mapi/proptag/0x3712001F")
    On Error GoTo 0
    If cid <> "" And Messaggio.BodyFormat = olFormatHTML Then
        AllegatoIncorporato = (InStr(Messaggio.HTMLBody, "cid:" & cid) > 0)
    End If
End Function
```

Salva con l'icona del dischetto e chiudi l'editor. La prima volta, chiudi e riapri Outlook per far partire `Application_Startup`.


## Stampare solo un tipo di file (es. solo i PDF)

Se non vuoi stampare *tutto*, ma solo gli allegati di un certo tipo, basta un controllo in più sull'estensione. Nel ciclo `For Each`, al posto della riga che salva e stampa, metti:

```vba
Dim estensione As String
estensione = LCase(Mid(allegato.FileName, InStrRev(allegato.FileName, ".") + 1))
If estensione = "pdf" Then
    Dim percorso As String
    percorso = cartella & allegato.FileName
    allegato.SaveAsFile percorso
    shell.Namespace(cartella).ParseName(allegato.FileName).InvokeVerb "Stampa"
End If
```

Perché i PDF si stampino serve un lettore predefinito installato (per esempio Adobe Acrobat Reader). Cambia `"pdf"` con l'estensione che ti interessa (`"docx"`, `"jpg"`…).

## Limitarla a un mittente o a una cartella

Per non stampare ogni cosa che arriva, aggiungi un filtro all'inizio di `StampaAllegati`. Per esempio, solo da un certo mittente:

```vba
If InStr(1, Messaggio.SenderEmailAddress, "ordini@fornitore.it", vbTextCompare) = 0 Then Exit Sub
```

In alternativa, con una **regola di Outlook** puoi spostare in una cartella dedicata solo le email che ti interessano, e agganciare la macro a quella cartella invece che alla Posta in arrivo.

## Attenzione a tre cose

- **Le macro vanno abilitate.** In *File → Opzioni → Centro protezione → Impostazioni Centro protezione → Impostazioni delle macro* scegli un livello che le consenta. Attenzione: abilitare tutte le macro è un rischio, meglio firmare la propria e consentire solo quelle firmate.
- **Stampa senza chiedere.** La macro non ti avvisa: assicurati che la stampante giusta sia quella predefinita, o rischi di stampare documenti riservati sulla stampante sbagliata.
- **Privacy.** Stampare in automatico significa che ogni allegato finisce su carta, anche quelli che non volevi. Su una casella condivisa valuta bene cosa lasci passare.

## Le mie considerazioni

> Qui aggiungi la tua prova diretta: su quale versione di Outlook l'hai testata, se hai usato la variante "solo PDF", quanto tempo ti fa risparmiare davvero e in quale situazione l'hai messa in produzione.
