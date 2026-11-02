---
title: "Padding Oracle: quando «cifrato» non significa «sicuro»"
date: 2026-11-02 10:00:00 +0100
categories: [Sicurezza]
image: /assets/img/tls-attacks/cover.png
description: "Due Padding Oracle, un cookie falsificato e un token amministratore decifrato: come l'uso sbagliato della cifratura trasforma un utente ordinario in admin. Laboratorio HTB Academy, spiegato per ogni lettore."
published: true
---

«Se è cifrato, è sicuro.» È una delle convinzioni più diffuse, e tra le più ingannevoli, di tutta la sicurezza informatica. La crittografia, in fondo, somiglia a una cassaforte: non conta tanto di che metallo è fatta, quanto **dove lasci la chiave e come chiudi lo sportello**. In questa storia la cassaforte è solida; a cedere è il modo in cui viene usata. Bastano due distrazioni, piccole e in apparenza innocue, per spalancarla: un utente qualunque diventa amministratore, e un segreto che doveva restare illeggibile torna in chiaro.

Il primo errore è **fidarsi di un dato che l'utente tiene in mano**. Se un'applicazione decide chi sei leggendo un cookie cifrato (per esempio un campo `role: user`) ma non ne protegge l'integrità, quel cookie diventa manipolabile: con il ragionamento giusto è possibile farsi riconoscere come amministratore senza conoscere alcuna password. Il secondo errore è **dire troppo quando qualcosa va storto**: un messaggio d'errore che distingue «dato decifrato ma non valido» da «decifratura fallita» trasforma il server in un *oracolo*, cioè in qualcosa che, risposta dopo risposta, lascia trapelare il contenuto di dati che dovrebbero restare segreti. È il cuore di quello che si chiama **Padding Oracle**.

Presi singolarmente sembrano dettagli. Messi insieme, permettono di trasformare un account ordinario in un amministratore e di leggere un token che avrebbe dovuto restare illeggibile. Queste due debolezze le ho ritrovate, una accanto all'altra, in un laboratorio di **HTB Academy** dedicato proprio a questi temi: il modulo [HTTPS/TLS Attacks](https://academy.hackthebox.com/course/preview/httpstls-attacks). In questo articolo le ricostruisco passo dopo passo.

**Il percorso in breve:** login come utente ordinario → analisi del cookie `user` → Padding Oracle su `/admin` → decifratura del ruolo → costruzione di un cookie `admin` → accesso all'area riservata → Padding Oracle su `/token` → recupero della flag.

> **Ambiente autorizzato.** Tutte le richieste e le tecniche descritte le ho eseguite esclusivamente nella Pwnbox di **Hack The Box Academy**, contro il target temporaneo del laboratorio. Cookie, token e indirizzi riportati appartengono a un ambiente didattico e non vanno riutilizzati contro sistemi non autorizzati. Le schermate provengono tutte dall'istanza `154.57.164.67:35422`.

## 1. Scenario, strumenti e obiettivo

Nel laboratorio, **CipherForge Labs** è una società che si affida a una propria soluzione crittografica. Qui non si tratta di «bucare» qualcosa, ma di osservare come l'applicazione usa la cifratura e di ragionare sui suoi errori di integrazione e di gestione dei segreti, non sulla complessità matematica degli algoritmi.

L'obiettivo indicato da HTB è **elevare i privilegi e decifrare il token dell'amministratore per ottenere la flag**. Parto con credenziali legittime, ma limitate, per l'utente `htb-stdnt`. La Pwnbox esegue Parrot Linux; per le prove uso **Firefox**, le sue **Developer Tools**, `curl` e **PadBuster 0.3.3**.

| Elemento | Valore nel laboratorio |
| --- | --- |
| Applicazione | CipherForge Labs, Admin Panel |
| Target dell'istanza | `154.57.164.67:35422` |
| Utente iniziale | `htb-stdnt` (account ordinario fornito da HTB) |
| Risorsa riservata | `GET /admin` |
| Funzione di riscatto | `POST /token` |
| Strumento utilizzato | PadBuster 0.3.3 |

**Una precisazione importante:** il modulo si intitola *HTTPS/TLS Attacks*, ma la falla che dimostro qui si trova **nella crittografia usata dall'applicazione web per cookie e token**, non nella negoziazione TLS in sé. La pagina era inoltre raggiunta tramite `http://`, senza HTTPS.

## 2. Ricognizione

L'accesso con le credenziali HTB mi porta alla Dashboard. Il menu laterale contiene due voci che attirano subito l'attenzione: **Admin Area** e **Redeem Token**. La prima sembra richiedere privilegi superiori; la seconda riceve un valore cifrato, che diventerà rilevante soltanto dopo l'escalation.

![Dashboard di CipherForge Labs dopo il login con l'account ordinario](/blog/assets/img/tls-attacks/01-dashboard.png)
*Figura 1. Dashboard di CipherForge Labs dopo il login con l'account ordinario.*

Per verificare il livello dei miei privilegi, apro `/admin` direttamente dal menu. Il server risponde con una pagina essenziale:

```text
Unauthorized User
```

![L'applicazione nega l'accesso all'area amministrativa](/blog/assets/img/tls-attacks/02-unauthorized.png)
*Figura 2. L'applicazione nega l'accesso all'area amministrativa.*

Questa risposta è il mio **punto di partenza**: il login funziona, ma il server distingue tra un utente *autenticato* e uno *autorizzato* alla risorsa riservata. Non ho motivo di cercare altre password; devo capire **quali dati usa l'applicazione per decidere il ruolo**.

## 3. Il cookie `user`: una stringa esadecimale che trasporta il ruolo

Apro **Firefox → F12 → Storage → Cookies**, seleziono il dominio del laboratorio e osservo un cookie chiamato `user`. Il suo valore è composto esclusivamente da caratteri esadecimali minuscoli, cioè `0–9` e `a–f`.

![Il cookie user nella scheda Storage di Firefox](/blog/assets/img/tls-attacks/03-cookie-user.png)
*Figura 3. Il cookie `user` nella scheda Storage di Firefox.*

Il cookie della mia istanza contiene **128 caratteri esadecimali**, equivalenti a **64 byte**, perché *due cifre esadecimali rappresentano un byte* (`128 ÷ 2 = 64`). Se la cifratura utilizza blocchi da 16 byte, 64 byte corrispondono a quattro blocchi. In uno schema CBC comune, il primo blocco può trasportare l'**IV** (*Initialization Vector*) e i successivi il testo cifrato.

Conviene non confondere tre concetti: **esadecimale è una codifica**, non un algoritmo di cifratura; **cifrare** serve a nascondere il contenuto; **autenticare** un dato significa garantirne l'origine e l'integrità. Una stringa cifrata può nascondere perfettamente un ruolo e restare comunque modificabile, se la sua integrità non viene protetta adeguatamente.

Nel mio caso il cookie si presta a essere analizzato con PadBuster impostando **16 byte come dimensione del blocco**. Questo dato, da solo, **non prova che l'algoritmo sia AES**: dice soltanto quale dimensione di blocco è risultata funzionale per il primo tentativo.

## 4. L'indizio decisivo: `Unauthorized User` contro `Decryption failed`

Per verificare come il server reagisce a dati errati, invio un cookie volutamente malformato all'endpoint `/admin`:

```bash
curl -i -H 'Cookie: user=invalid' \
  http://154.57.164.67:35422/admin
```

Il risultato non coincide con quello del cookie autentico. Con un cookie di utente ordinario il server scrive `Unauthorized User`; con `user=invalid` restituisce **`Decryption failed`**.

![Il terminale evidenzia Decryption failed, mentre Firefox mostra Unauthorized User](/blog/assets/img/tls-attacks/04-decryption-failed.png)
*Figura 4. Il terminale evidenzia `Decryption failed`, mentre Firefox mostra `Unauthorized User`.*

La particolarità è che **entrambe le risposte hanno stato HTTP 401 e una lunghezza di 17 byte**. Perciò uno strumento che controllasse soltanto lo status code o la dimensione della risposta potrebbe non distinguere i casi. Il contenuto testuale, invece, espone due risultati diversi della logica interna: il cookie viene decifrato ma non autorizza l'utente, oppure la sua decifratura fallisce.

Questo **è l'indizio iniziale**, non ancora la dimostrazione conclusiva di un Padding Oracle: il messaggio `Decryption failed` potrebbe riferirsi a diversi problemi. La conferma arriva quando riesco a sfruttare sistematicamente le differenze nelle risposte per ricostruire il plaintext.

### Come funziona un Padding Oracle, spiegato senza dare nulla per scontato

Nella cifratura a blocchi in modalità **CBC**, il testo è diviso in blocchi. Durante la decifratura, ciascun blocco dipende sia dal blocco cifrato corrente, sia dal blocco precedente; per il primo blocco entra in gioco l'IV.

```text
Per i blocchi successivi al primo:
P[i] = D_K(C[i]) XOR C[i−1]

Per il primo blocco:
P[1] = D_K(C[1]) XOR IV
```

`P` indica il testo in chiaro (*plaintext*), `C` il testo cifrato (*ciphertext*), `D_K` la decifratura con la chiave segreta e **XOR** un'operazione bit a bit. La conseguenza pratica è fondamentale: **modificando alcuni byte del ciphertext precedente si può influenzare il plaintext di un blocco**, pur senza conoscere la chiave.

**Un esempio alla mano.** Immagina che ogni blocco, per diventare leggibile, venga «mescolato» con quello che lo precede. Il bello è che quel blocco precedente non è un segreto: è un pezzo del messaggio cifrato che ho già tra le mani e che posso ritoccare come voglio. E il mescolamento è ordinato: se cambio un pezzetto del blocco precedente, cambia **esattamente** il pezzetto corrispondente del testo leggibile che ne esce, né più né meno. Non so in anticipo quale carattere comparirà, ma so che ogni mia piccola modifica ha un effetto preciso e ripetibile sul blocco successivo. È un po' come avere una fila di manopole: non vedo il risultato finale, però girando una manopola so quale carattere si muove. Ed è proprio questo controllo (cambio qualcosa in ingresso e guardo come reagisce il sistema) ad aprire la strada a tutto il resto.

Per riempire l'ultimo blocco, molti sistemi impiegano un padding come **PKCS#7**. Per esempio, se mancano tre byte, aggiungono `03 03 03`. Il server deve rimuovere questo riempimento quando decifra il messaggio. Se distingue, nelle sue risposte, un padding accettabile da uno scorretto, consegna a chi invia le richieste **un piccolo indizio ripetibile**.

**Come quell'indizio diventa una leva.** Prima di accettare un messaggio, il server controlla che il «riempimento» finale sia fatto a regola d'arte. Io sfrutto proprio questo controllo come un gioco del «caldo o freddo»: cambio l'ultimo pezzetto del blocco precedente e osservo la reazione. Finché il riempimento risulta sbagliato, il server protesta; quando smette di protestare, ho trovato il valore che rende il riempimento valido, e questo, indirettamente, mi rivela qual era il carattere nascosto in quella posizione. Trovato un carattere, passo al successivo, e un pezzetto alla volta ricostruisco l'intero blocco. Non ho mai visto la chiave: ho solo osservato quando il server dice «sì» e quando dice «no». PadBuster gioca questa partita al posto mio, con migliaia di tentativi in pochi minuti.

PadBuster automatizza questo processo: modifica opportunamente i byte, invia molte richieste, osserva le risposte e ricostruisce il contenuto cifrato **senza conoscere la chiave**. Non è una decifratura "a forza bruta" della chiave crittografica: è uno sfruttamento del comportamento del programma che la usa.

## 5. Primo passaggio: decifrare il cookie su `/admin`

Ho già tutti gli elementi necessari: endpoint, cookie originale, dimensione del blocco, codifica e messaggio d'errore. Imposto quindi PadBuster:

```bash
COOKIE='cd417f0da4d895154917debf9f9541dc9ac5a06828e1cd6b413a3bee6100874556e9cd3a3dabdb311484cbe3fdc391a1a83354b07cfc6199c8a5e2a7fed8131a'

padbuster 'http://154.57.164.67:35422/admin' "$COOKIE" 16 \
  -encoding 1 \
  -cookies "user=$COOKIE" \
  -error 'Decryption failed'
```

Le opzioni non sono dettagli marginali: `16` identifica il blocco, `-encoding 1` specifica **esadecimale minuscolo**, `-cookies` indica il punto in cui si trova il ciphertext e `-error` permette allo strumento di riconoscere le risposte che corrispondono all'errore.

![PadBuster recupera uno dopo l'altro i byte del cookie cifrato](/blog/assets/img/tls-attacks/05-padbuster-cookie-avvio.png)
*Figura 5. PadBuster recupera uno dopo l'altro i byte del cookie cifrato.*

Dopo aver analizzato i tre blocchi di ciphertext, lo strumento termina e presenta il risultato in formato ASCII:

```text
*** Finished ***
[+] Decrypted value (ASCII):
{"user": "htb-stdnt", "role": "user"}
```

![Il cookie decifrato contiene esplicitamente nome utente e ruolo](/blog/assets/img/tls-attacks/06-cookie-decifrato.png)
*Figura 6. Il cookie decifrato contiene esplicitamente nome utente e ruolo.*

Questo è il primo risultato davvero decisivo. **Il cookie conserva i privilegi dentro un JSON cifrato**, e sono riuscito a leggerlo senza ottenere la chiave del server. La differenza di risposta su `/admin` è dunque sfruttabile come oracle.

La causa non è che la cifratura abbia smesso di proteggere matematicamente i dati: è l'applicazione ad aver trasformato il processo di verifica del padding in un canale informativo verso chi invia richieste.

## 6. Seconda mossa: dal JSON ordinario al cookie `admin`

Una volta capito cosa c'è nel cookie, la domanda cambia: posso fare in modo che il server decifri un JSON diverso? Il contenuto che voglio ottenere è:

```json
{"user": "admin", "role": "admin"}
```

PadBuster prevede una modalità di **forging/encryption** tramite `-plaintext`. Invece di recuperare il testo di un ciphertext esistente, costruisco un ciphertext nuovo che il server decifrerà nel testo scelto:

```bash
padbuster 'http://154.57.164.67:35422/admin' "$COOKIE" 16 \
  -encoding 1 \
  -cookies "user=$COOKIE" \
  -error 'Decryption failed' \
  -plaintext '{"user": "admin", "role": "admin"}'
```

Il comando sfrutta **lo stesso oracle e la stessa chiave già presente sul server**, senza estrarre quella chiave. Terminata l'operazione, PadBuster mostra `Encrypted value is:`: è il nuovo cookie da presentare alla risorsa amministrativa.

**Che cosa fa, in concreto, questo cookie?** Non contiene la password dell'amministratore e non è una sessione «rubata». È semplicemente un ciphertext costruito in modo che, *quando il server lo decifra con la sua stessa chiave*, produca il JSON `{"user": "admin", "role": "admin"}`. Il server non si accorge di nulla, perché non verifica l'integrità del dato: lo decifra e si fida del ruolo che ci legge dentro. Presentando questo cookie a `/admin`, mi tratta come amministratore. È esattamente il punto debole: l'autorizzazione poggia su un dato che il client può fabbricare a tavolino.

![PadBuster produce un nuovo cookie cifrato associato al ruolo admin](/blog/assets/img/tls-attacks/07-cookie-admin-forgiato.png)
*Figura 7. PadBuster produce un nuovo cookie cifrato associato al ruolo `admin`.*

### Verifica da terminale

Uso il valore restituito dallo strumento nella richiesta successiva:

```bash
ADMIN_COOKIE='e229d8a9e42697ab26f61c38e00db5ae5f1cd90fdb85f20f81a48623746e914d3d2bdd97415095b66b720e552e81fedd00000000000000000000000000000000'

curl -i -H "Cookie: user=$ADMIN_COOKIE" \
  http://154.57.164.67:35422/admin
```

Questa volta il server ha risposto **`HTTP/1.1 200 OK`**, con il messaggio **`Hello Admin! Here is your token:`** e un token cifrato. È la prova dell'**escalation verticale dei privilegi**: un normale utente ha ottenuto l'accesso a una risorsa riservata all'amministratore.

![Nel risultato HTML da terminale appare il saluto all'amministratore e il token](/blog/assets/img/tls-attacks/08-admin-terminale.png)
*Figura 8. Nel risultato HTML da terminale appare il saluto all'amministratore e il token.*

### La stessa prova, visibile anche in Firefox

Per rendere l'articolo leggibile anche a chi non ha dimestichezza con il terminale, ho riprodotto la verifica nel browser. In **F12 → Storage → Cookies** ho sostituito il valore del cookie `user` con il ciphertext generato da PadBuster.

La pagina già aperta continuava inizialmente a mostrare `Unauthorized User`: modificare un cookie in Storage **non aggiorna automaticamente il contenuto della pagina già caricata**. Dopo aver ricaricato `/admin`, il server ha ricevuto il cookie nuovo e ha mostrato la pagina amministrativa.

![Il cookie sostituito in Firefox mentre la vecchia pagina riporta ancora Unauthorized User](/blog/assets/img/tls-attacks/09-cookie-sostituito-firefox.png)
*Figura 9. Il cookie sostituito in Firefox mentre la vecchia pagina riporta ancora `Unauthorized User`.*

![Dopo il reload, Firefox visualizza Hello Admin e il token cifrato](/blog/assets/img/tls-attacks/10-admin-firefox.png)
*Figura 10. Dopo il reload, Firefox visualizza `Hello Admin` e il token cifrato.*

Queste due prove sono complementari: **il terminale documenta la risposta HTTP e il browser mostra l'effetto concreto sull'interfaccia**. Non ho trovato la password dell'amministratore e non ho effettuato un login come admin: ho **falsificato un'informazione di sessione** che il server ha accettato come autorevole.

## 7. Il secondo Padding Oracle: decifrare il token dell'amministratore

L'area riservata espone un token esadecimale. L'obiettivo finale non è semplicemente possederlo: devo recuperarne il **contenuto in chiaro**. L'applicazione mette inoltre a disposizione l'endpoint `/token`, che riceve il parametro omonimo tramite **POST**.

In presenza di un token errato, la funzione segnala:

```text
Decryption Error. Invalid Token!
```

Questo è il secondo messaggio utile per il procedimento. La procedura è simile a quella del cookie, ma **cambiano tre aspetti essenziali**: l'endpoint è `/token`, il valore è nel corpo di una richiesta POST e la dimensione di blocco è **8 byte**, non 16.

Il token ottenuto da `/admin` sulla mia istanza è lungo **96 caratteri esadecimali**, quindi 48 byte. Per un blocco di 8 byte ciò equivale a sei blocchi complessivi; PadBuster ne ha decifrati cinque, trattando il blocco iniziale come riferimento per CBC.

```bash
TOKEN='0e0d74356da663454101d805584b6190eb57e7e30d9817ecfbf7973c9ab5df54f46a586de5c8693203896946088172a3'

padbuster 'http://154.57.164.67:35422/token' "$TOKEN" 8 \
  -encoding 1 \
  -cookies "user=$ADMIN_COOKIE" \
  -post "token=$TOKEN" \
  -error 'Decryption Error. Invalid Token!'
```

La presenza di `-post` è indispensabile: senza di essa PadBuster non modificherebbe il parametro nel punto richiesto dall'applicazione. `-cookies` mantiene invece il cookie amministrativo per accedere nel contesto corretto.

![Avvio del secondo Padding Oracle su /token con blocchi da otto byte](/blog/assets/img/tls-attacks/11-padbuster-token-avvio.png)
*Figura 11. Avvio del secondo Padding Oracle su `/token` con blocchi da otto byte.*

**Attenzione alla dimensione di blocco:** 8 byte non è un "livello di sicurezza" e, da solo, **non permette di identificare con certezza l'algoritmo impiegato**. Diversi cifrari tradizionali utilizzano blocchi da 64 bit. Nel laboratorio so che questa impostazione è risultata corretta per il token, non quale implementazione sia stata usata internamente.

Dopo la ricostruzione dei cinque blocchi, PadBuster restituisce il plaintext:

```text
*** Finished ***
[+] Decrypted value (ASCII): HTB{……… flag oscurata ………}
```

![Il secondo Padding Oracle recupera la flag dal token amministrativo cifrato](/blog/assets/img/tls-attacks/12-token-decifrato-flag.png)
*Figura 12. Il secondo Padding Oracle recupera la flag dal token amministrativo cifrato (valore oscurato).*

**Questo dimostra la compromissione della riservatezza:** il token era cifrato, ma il server ne ha rivelato il contenuto indirettamente attraverso l'oracle. Ancora una volta, non è stato necessario recuperare la chiave crittografica.

### La conferma della funzionalità Redeem in Firefox

Ho documentato separatamente anche il comportamento visibile nel browser. Dopo aver inserito il token originale nell'interfaccia **Redeem Token**, la scheda **Network → Response** di Firefox ha mostrato il messaggio:

```text
Token successfully redeemed.
Check you email for further information.
```

![La risposta al POST /token in Firefox conferma l'avvenuto riscatto](/blog/assets/img/tls-attacks/13-redeem-firefox.png)
*Figura 13. La risposta al POST `/token` in Firefox conferma l'avvenuto riscatto.*

È importante **non confondere i due risultati**: Firefox conferma che l'applicazione *accetta il token* e lo considera riscattato; **PadBuster dimostra che il suo contenuto può essere decifrato**. La flag non è stata restituita dalla normale pagina web: l'ho recuperata attraverso il secondo Padding Oracle.

## 8. Perché funziona: le due proprietà di sicurezza compromesse

Non si tratta di una singola password debole. La catena che ho seguito sfrutta due applicazioni dello stesso difetto generale: **un sistema che impiega la cifratura a blocchi senza proteggere correttamente l'integrità dei dati e rivela, nelle risposte, informazioni utili sul processo di decifratura**.

| Vulnerabilità | Endpoint | Effetto dimostrato |
| --- | --- | --- |
| Primo Padding Oracle | `GET /admin` | Lettura del JSON di sessione; creazione di un cookie con ruolo `admin` |
| Secondo Padding Oracle | `POST /token` | Decifratura del token amministrativo; recupero della flag |

Il primo viola l'**integrità e l'autenticità dei privilegi**: un utente non dovrebbe poter convincere il server di avere il ruolo `admin` modificando ciò che conserva sul client. Il secondo viola la **riservatezza**: dati che dovrebbero rimanere segreti possono essere ricostruiti attraverso l'interazione con il servizio.

Un dettaglio particolarmente istruttivo è che l'oracle può funzionare anche quando i codici HTTP sono uguali. In `/admin` il server rispondeva `401` sia a una sessione ordinaria sia a un cookie malformato: sono state **le diverse stringhe di errore** a diventare il segnale sfruttato per ricostruire i dati.

## 9. Come si sarebbe potuto evitare

Le contromisure efficaci non consistono soltanto nel nascondere il messaggio d'errore. Occorre ripensare il modo in cui l'applicazione protegge sessioni e token.

1. **Usare cifratura autenticata**, per esempio AES-GCM o ChaCha20-Poly1305, che verifichi anche l'integrità del messaggio. Con cifratura autenticata, un dato alterato non deve arrivare alla logica applicativa come se fosse valido.
2. **Non affidare l'autorizzazione a campi di ruolo modificabili dal client.** Un cookie di sessione può contenere un identificatore casuale e opaco; il ruolo e i permessi devono essere verificati dal server. In alternativa, un token firmato e convalidato correttamente può trasportare informazioni di autorizzazione.
3. **Uniformare gli errori crittografici** e ridurre differenze osservabili, comprese quelle nei tempi di risposta. È una difesa complementare, non un sostituto dell'autenticazione dei ciphertext.
4. **Usare HTTPS e proteggere i cookie** con `Secure`, `HttpOnly` e una politica `SameSite` adeguata. Nella mia istanza la pagina era servita via HTTP e il cookie mostrava `Secure: false` e `HttpOnly: false`: problemi distinti dal Padding Oracle, ma da correggere.
5. **Aggiornare librerie e implementazioni, limitare le richieste anomale e monitorare i tentativi ripetuti.** Il rate limiting può ridurre la praticabilità della tecnica, ma da solo non elimina la vulnerabilità.

**Che cosa non basta:** cambiare chiave periodicamente, nascondere il sorgente o usare un algoritmo "proprietario" non risolve il fatto che il server esponga un oracle. Una crittografia robusta richiede primitive corrette, integrazione corretta e verifiche affidabili delle autorizzazioni.

## 10. Conclusione: il problema non era rompere la cifratura

Sono partito da un account ordinario, ho incontrato un `Unauthorized User` e ho notato un cookie che sembrava soltanto una lunga stringa incomprensibile. Il primo passo davvero utile non è stato cambiare bit alla cieca: è stato **individuare l'endpoint corretto e il messaggio d'errore che distingueva i risultati della decifratura**.

Da lì PadBuster ha recuperato il JSON `{"user": "htb-stdnt", "role": "user"}`. Poi ho generato il ciphertext per `{"user": "admin", "role": "admin"}`, ho verificato l'accesso da terminale e ho ripetuto la prova in Firefox. Infine, un secondo Padding Oracle, questa volta con **blocchi da 8 byte su una richiesta POST**, mi ha permesso di leggere il contenuto del token e completare il laboratorio.

La lezione è semplice, ma decisiva: **la cifratura non protegge un'applicazione se il modo in cui viene utilizzata rivela informazioni o permette di falsificare i dati su cui si basano le autorizzazioni**. È per questo che, durante un test, studiare gli errori e il flusso applicativo può essere tanto importante quanto conoscere gli algoritmi.

## 11. Mini-glossario per orientarsi

Dopo aver seguito i comandi, può essere utile fissare alcuni termini che ricorrono spesso nell'analisi delle vulnerabilità crittografiche:

- **Plaintext:** il contenuto leggibile prima della cifratura oppure dopo una decifratura corretta. Nel primo caso è il JSON con `user` e `role`; nel secondo è la flag.
- **Ciphertext:** la sequenza di byte cifrati. Nel laboratorio viaggia nel cookie `user` oppure nel parametro POST `token`, entrambi rappresentati con caratteri esadecimali.
- **IV (Initialization Vector):** il valore che inizializza una modalità di cifratura come CBC. Non deve necessariamente restare segreto, ma deve essere gestito correttamente; da solo non garantisce l'integrità.
- **CBC (Cipher Block Chaining):** una modalità di cifratura in cui i blocchi sono concatenati. Questa relazione permette modifiche controllabili al plaintext risultante quando il ciphertext non è autenticato.
- **Padding:** i byte aggiunti per completare l'ultimo blocco. La verifica del padding è la fase da cui il mio oracle ricava informazioni.
- **Oracle:** un servizio che, attraverso differenze di errore o di tempo, fornisce informazioni utili su dati che non dovrebbe rivelare. Qui l'oracle è l'applicazione stessa.
- **AEAD:** *Authenticated Encryption with Associated Data*. Tecniche come AES-GCM proteggono contemporaneamente riservatezza e integrità, riducendo il rischio di manomissioni del ciphertext.

Un buon test di sicurezza deve saper distinguere questi livelli: **la codifica non è cifratura; la cifratura non implica autenticità; un errore ben visibile può trasformare il server in uno strumento contro sé stesso**.

## Riferimenti e approfondimenti

- [HTB Academy: HTTPS/TLS Attacks (modulo)](https://academy.hackthebox.com/course/preview/httpstls-attacks)
- [PadBuster: Repository ufficiale (AonCyberLabs)](https://github.com/AonCyberLabs/PadBuster)
- [NIST SP 800-38D: Galois/Counter Mode (AES-GCM)](https://csrc.nist.gov/pubs/sp/800/38/d/final)
- [MITRE ATT&CK: Exploitation for Privilege Escalation (T1068)](https://attack.mitre.org/techniques/T1068/)

*Laboratorio svolto su HTB Academy, modulo HTTPS/TLS Attacks. Tutte le evidenze provengono dall'ultima istanza che ho analizzato.*
