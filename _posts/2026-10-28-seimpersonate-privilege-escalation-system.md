---
title: "Windows Privilege Escalation: da MSSQL a SYSTEM con SeImpersonatePrivilege e PrintSpoofer"
date: 2026-10-28 18:00:00 +0200
categories: [Sicurezza]
image: /assets/img/seimpersonate/cover.png
description: "Un account di servizio MSSQL con SeImpersonatePrivilege può arrivare a NT AUTHORITY\\SYSTEM, ma solo con il vettore giusto. Analisi fase per fase con PrintSpoofer, e come difendersi."
published: true
---

Non sempre, per compromettere un server Windows, serve sfruttare una vulnerabilità complessa o utilizzare un exploit contro un servizio non aggiornato.

A volte basta ottenere l'esecuzione di comandi nel contesto di un account di servizio e scoprire che Windows gli ha già assegnato un privilegio particolarmente interessante: **SeImpersonatePrivilege**.

È un diritto legittimo, utilizzato da numerosi servizi Windows per operare temporaneamente con l'identità degli utenti autenticati. Tuttavia, quando viene combinato con un meccanismo di impersonazione sfruttabile, può consentire a un attaccante di passare da un account di servizio a `NT AUTHORITY\SYSTEM`.

In questo laboratorio di HTB Academy ho ricostruito proprio questa catena:

**Accesso MSSQL → esecuzione di comandi → identificazione di SeImpersonatePrivilege → PrintSpoofer → SYSTEM.**

Vedremo come individuare il privilegio, cosa rende possibile l'escalation, come interpretare i risultati e soprattutto quali controlli possono interrompere l'attacco.

> **Nota sull'utilizzo responsabile.** Le attività descritte sono state svolte esclusivamente in un ambiente di laboratorio autorizzato HTB Academy. I comandi e le tecniche sono riportati per finalità didattiche, di ricerca e di sicurezza difensiva. Qualsiasi test su sistemi di terzi richiede un'autorizzazione esplicita.

## 1. SeImpersonatePrivilege: il privilegio che permette di cambiare identità

Per capire l'attacco dobbiamo partire da un concetto fondamentale della sicurezza Windows: **l'impersonazione**.

Immaginiamo un'applicazione web che riceve una richiesta da un utente autenticato. Per eseguire determinate operazioni, il servizio potrebbe dover accedere alle risorse utilizzando temporaneamente l'identità di quell'utente anziché la propria.

Windows permette questo comportamento attraverso gli *access token*, strutture che contengono informazioni sull'identità e sui privilegi associati a un processo o a un thread.

Il privilegio che consente a un processo di impersonare un client autenticato è `SeImpersonatePrivilege`. Nelle impostazioni di sicurezza Windows viene indicato come *Impersonate a client after authentication*, tradotto in italiano come «Rappresentare un client dopo l'autenticazione».

Non si tratta di una vulnerabilità. È una funzionalità prevista dal sistema operativo e utilizzata in diversi scenari applicativi, specialmente nei servizi che gestiscono richieste per conto di altri utenti. Per questo motivo può essere presente nel token di account utilizzati da IIS, SQL Server e altri componenti Windows.

### Perché diventa pericoloso?

Il problema nasce quando un attaccante riesce a eseguire codice all'interno di un processo dotato di questo privilegio. A quel punto, se riesce a ottenere un token impersonabile appartenente a un contesto più privilegiato, può tentare di utilizzarlo per eseguire operazioni con quell'identità.

Ma bisogna chiarire un aspetto importante: **possedere SeImpersonatePrivilege non significa essere già SYSTEM.**

Il privilegio permette di effettuare determinate operazioni di impersonazione, ma non fornisce automaticamente un token privilegiato. Per raggiungere SYSTEM serve quindi un ulteriore elemento: un **vettore** che permetta di ottenere un contesto di impersonazione adeguato. Ed è qui che entrano in gioco tecniche come PrintSpoofer.

## 2. Il punto d'ingresso: un'istanza Microsoft SQL Server

Nel laboratorio parto da un'istanza MSSQL accessibile dalla rete.

Questo scenario è particolarmente interessante perché, durante un penetration test, può capitare di individuare credenziali SQL all'interno di file di configurazione, script applicativi o condivisioni di rete. Disporre di credenziali valide non significa necessariamente avere il controllo del server, ma consente di analizzare le autorizzazioni associate all'account.

Per collegarmi utilizzo `mssqlclient.py`, uno degli strumenti della suite [Impacket](https://github.com/fortra/impacket), che permette di interagire con diversi protocolli e servizi Windows.

```bash
mssqlclient.py sql_dev@10.129.253.102 -windows-auth
```

L'opzione `-windows-auth` indica che l'autenticazione viene effettuata utilizzando credenziali Windows anziché un login SQL nativo. Una volta stabilita la connessione, ottengo il prompt interattivo `SQL>`.

L'obiettivo iniziale è capire se l'account dispone di autorizzazioni che permettono di interagire con il sistema operativo sottostante.

### Dall'accesso SQL all'esecuzione di comandi Windows

SQL Server mette a disposizione una funzionalità chiamata `xp_cmdshell`, una stored procedure estesa che permette di eseguire comandi del sistema operativo. È disabilitata per impostazione predefinita, perché aumenta sensibilmente la superficie di attacco.

Nel laboratorio, grazie alle autorizzazioni disponibili, posso abilitarla mediante il comando supportato dal client Impacket:

```text
SQL> enable_xp_cmdshell
```

Successivamente verifico l'identità con cui vengono eseguiti i comandi:

```text
SQL> xp_cmdshell whoami
```

Il risultato è `nt service\mssql$sqlexpress01`.

Questo output ci dice qualcosa di importante: **non stiamo eseguendo comandi come l'utente che ha effettuato l'accesso al database, ma nel contesto dell'account di servizio MSSQL**. Nel caso specifico si tratta dell'identità virtuale associata all'istanza SQL Server.

Va precisato che questo comportamento non è universale: a seconda delle autorizzazioni e della configurazione, `xp_cmdshell` può utilizzare anche un account proxy dedicato. Per questo eseguire `whoami` è sempre una verifica fondamentale.

Ora abbiamo un punto d'appoggio sul sistema operativo. La domanda successiva è: quali privilegi possiede questo account?

## 3. Ricognizione: identificare SeImpersonatePrivilege

Quando si ottiene l'esecuzione di comandi su un sistema Windows, uno dei primi controlli consiste nell'esaminare il token di sicurezza del contesto corrente. Windows permette di farlo con `whoami /priv`.

Dal prompt SQL eseguo:

```text
SQL> xp_cmdshell whoami /priv
```

Il comando restituisce l'elenco dei privilegi presenti nel token del processo. Tra questi compare la voce che stavo cercando: `SeImpersonatePrivilege  Enabled`.

![Output di xp_cmdshell whoami /priv con SeImpersonatePrivilege abilitato](/blog/assets/img/seimpersonate/01-whoami-priv.png)
*Figura 1 — Il servizio SQL Server dispone di SeImpersonatePrivilege e il privilegio risulta abilitato nel token corrente.*

Questa è la prima evidenza concreta del laboratorio. L'account MSSQL possiede un diritto che può essere sfruttato da alcune tecniche di local privilege escalation.

La presenza di `Enabled` non garantisce che l'attacco funzionerà. Indica però che una delle sue condizioni fondamentali è soddisfatta. A questo punto dobbiamo individuare un meccanismo compatibile con il sistema operativo che ci permetta di sfruttare quel privilegio.

## 4. La famiglia Potato: dal privilegio al vettore di escalation

Nel mondo della Windows Privilege Escalation esiste una famiglia di tecniche comunemente conosciuta come **Potato**. Il principio comune è abusare di determinati meccanismi di autenticazione o comunicazione tra processi per ottenere un contesto di sicurezza più privilegiato. Gli strumenti, però, non sono tutti intercambiabili.

**JuicyPotato** è una delle tecniche storiche più conosciute. Sfrutta particolari comportamenti legati a COM/DCOM e NTLM per ottenere token privilegiati utilizzabili in un'escalation. La tecnica originale incontra limitazioni importanti a partire da Windows 10 versione 1809 e Windows Server 2019.

**RoguePotato** è una tecnica successiva che affronta alcune delle limitazioni incontrate dai precedenti attacchi basati sull'impersonazione. Utilizza un meccanismo differente che coinvolge l'autenticazione e la comunicazione RPC.

**PrintSpoofer** è lo strumento che utilizzo nel laboratorio. Sviluppato da itm4n, sfrutta un'interazione con il servizio Windows Print Spooler per ottenere una connessione privilegiata attraverso una named pipe. La sua efficacia dipende dalla configurazione del sistema e dalla disponibilità del meccanismo utilizzato.

### Perché ho scelto PrintSpoofer?

Nel laboratorio gli strumenti necessari erano già disponibili nella directory `C:\tools`. Ne verifico il contenuto attraverso SQL Server:

```text
SQL> xp_cmdshell dir C:\tools
```

![Contenuto della directory C:\tools con PrintSpoofer, JuicyPotato e RoguePotato](/blog/assets/img/seimpersonate/02-arsenal.png)
*Figura 2 — Gli strumenti predisposti nell'ambiente HTB Academy. Il sistema del laboratorio utilizza Windows Server 2016; per questa dimostrazione scelgo PrintSpoofer.*

La scelta non dipende semplicemente dal fatto che PrintSpoofer sia più recente. Voglio osservare una tecnica che utilizza le named pipe e il servizio di stampa per mostrare concretamente come l'impersonazione possa diventare un problema di sicurezza.

## 5. Come funziona realmente PrintSpoofer?

Prima di passare all'esecuzione, è utile comprendere cosa accade dietro le quinte. PrintSpoofer combina tre elementi:

- **Named pipe:** un canale di comunicazione tra processi Windows.
- **Print Spooler:** il servizio di gestione della stampa, che normalmente opera nel contesto LocalSystem.
- **SeImpersonatePrivilege:** il diritto necessario per impersonare un client autenticato quando le condizioni lo consentono.

L'idea alla base della tecnica è sfruttare una funzionalità RPC del servizio di stampa per provocare una connessione verso una named pipe controllata dal processo che effettua l'attacco. Quando la connessione avviene nel contesto privilegiato atteso, Windows può rendere disponibile al server della named pipe un token di impersonazione. PrintSpoofer utilizza quindi il privilegio posseduto dall'account di servizio per impersonare quel contesto. Se il token e le autorizzazioni disponibili lo permettono, lo strumento può creare un nuovo processo con privilegi superiori.

Il punto centrale è questo: **SeImpersonatePrivilege consente di impersonare; PrintSpoofer crea le condizioni per ottenere un'identità privilegiata da impersonare.**

Non è quindi il privilegio, da solo, a trasformare un account MSSQL in SYSTEM. È la combinazione tra il diritto di impersonazione, il comportamento del servizio e le condizioni di sicurezza del sistema operativo.

## 6. L'escalation: da MSSQL a NT AUTHORITY\SYSTEM

Arriviamo alla parte pratica. Nel laboratorio abbiamo già verificato tre condizioni:

1. Possiamo eseguire comandi Windows attraverso SQL Server.
2. I comandi vengono eseguiti nel contesto dell'account di servizio MSSQL.
3. Quel contesto dispone di `SeImpersonatePrivilege` abilitato.

Resta da verificare se PrintSpoofer riesce effettivamente a sfruttare il vettore scelto.

### Preparazione della sessione di laboratorio

Per osservare il risultato dell'esecuzione privilegiata, nell'ambiente HTB Academy era stato predisposto un listener Netcat sulla macchina di testing:

```bash
sudo nc -lnvp 8443
```

La dimostrazione originale utilizzava PrintSpoofer per avviare, nel contesto privilegiato ottenuto, un processo che stabiliva una sessione di ritorno verso il listener. La verifica tecnica dell'escalation, tuttavia, non dipende dal fatto di utilizzare una reverse shell: ciò che conta è dimostrare l'identità e il contesto del processo creato.

### Esecuzione di PrintSpoofer

Dal contesto SQL viene eseguito PrintSpoofer con l'obiettivo di avviare un processo privilegiato. L'output restituito dallo strumento contiene due messaggi fondamentali:

```text
[+] Found privilege: SeImpersonatePrivilege
[+] CreateProcessAsUser() OK
```

![Output di PrintSpoofer con il privilegio rilevato e CreateProcessAsUser() OK](/blog/assets/img/seimpersonate/03-printspoofer.png)
*Figura 3 — PrintSpoofer individua SeImpersonatePrivilege e segnala che la creazione del processo è riuscita.*

Il primo messaggio conferma che il processo possiede il privilegio richiesto. Il secondo indica che la creazione del nuovo processo attraverso l'API Windows `CreateProcessAsUser()` è riuscita. È un risultato significativo, ma per verificare l'escalation dobbiamo controllare direttamente l'identità del processo ottenuto.

### Verifica finale: whoami

Nella sessione di laboratorio eseguo `whoami` e `hostname`. Il risultato restituisce `nt authority\system` su `WINLPE-SRV01`.

![Sessione ottenuta nel laboratorio con output di whoami e hostname](/blog/assets/img/seimpersonate/04-system.png)
*Figura 4 — La verifica finale conferma l'esecuzione nel contesto NT AUTHORITY\SYSTEM sul sistema WINLPE-SRV01.*

Abbiamo così dimostrato che l'escalation è riuscita. All'inizio del laboratorio il nostro contesto di esecuzione era `nt service\mssql$sqlexpress01`; alla fine è `nt authority\system`.

Questo passaggio rappresenta un'escalation locale verso uno dei contesti più privilegiati di Windows. Non significa automaticamente aver compromesso l'intero dominio Active Directory o altre macchine della rete. Significa però aver ottenuto un controllo locale estremamente elevato, con conseguenze potenzialmente gravi per la sicurezza dell'host.

## 7. Come difendersi da SeImpersonatePrivilege e PrintSpoofer

Il laboratorio mostra che l'escalation non dipende da un singolo errore, ma dalla combinazione di più condizioni. Per questo la difesa dovrebbe concentrarsi su tre obiettivi: **prevenire l'accesso al vettore, rilevare i comportamenti sospetti e contenere un'eventuale compromissione**.

### Prevenzione: ridurre le opportunità di escalation

**Controllare chi ha il privilegio.** Identifica gli account a cui è assegnato `SeImpersonatePrivilege` esportando la policy locale:

```cmd
secedit /export /cfg C:\pol.cfg
```

Cerca la voce `SeImpersonatePrivilege`. L'obiettivo non è toglierlo ovunque (serve a molti servizi), ma verificare che sia assegnato **solo dove necessario** — tenendo presente che le GPO di dominio possono aggiungere assegnazioni non visibili qui.

**Proteggere SQL Server.** La catena è partita da `xp_cmdshell`: va tenuto disabilitato quando non serve. Verifica con `EXEC sp_configure 'xp_cmdshell';` — il valore dovrebbe essere `0`. In più: niente ruolo `sysadmin` ai login applicativi, password robuste e service account a privilegi minimi (le gMSA aiutano a gestire le credenziali, ma non bastano a fermare l'abuso del privilegio).

**Ridurre la superficie di Print Spooler.** Sui server senza esigenze di stampa, valuta di disattivarlo (stato: `Get-Service Spooler`):

```powershell
Stop-Service Spooler
Set-Service Spooler -StartupType Disabled
```

Riduce la superficie di PrintSpoofer, ma non elimina le altre tecniche di impersonazione.

### Rilevamento: individuare i segnali dell'attacco

Un attacco come quello osservato può produrre diversi indicatori monitorabili.

| Evento | Cosa osservare |
|---|---|
| Sysmon Event ID 1 | Creazione di processi insoliti da `sqlservr.exe` |
| Windows Security 4688 | Avvio di processi e relativa catena parent-child |
| Sysmon Event ID 17/18 | Creazione e connessione a named pipe sospette |
| Sysmon Event ID 3 | Connessioni di rete inattese da processi del server |
| SQL Server Audit | Modifiche sensibili alla configurazione e attività SQL, secondo le regole di audit configurate |

Il segnale più netto è un `cmd.exe`/`powershell.exe` generato da `sqlservr.exe`: su un server che fa solo da database è un'anomalia evidente. L'importante è **correlare** gli eventi — un singolo indicatore non è una prova.

### Contenimento: limitare le conseguenze

Se un attaccante riesce a ottenere SYSTEM, la compromissione deve essere considerata potenzialmente grave. Le misure di contenimento includono:

- **Application control:** utilizzare WDAC o AppLocker per consentire soltanto l'esecuzione di programmi autorizzati, evitando regole basate esclusivamente sul nome degli eseguibili.
- **Segmentazione di rete:** limitare le connessioni in ingresso e in uscita, soprattutto dai server che non devono comunicare direttamente con Internet.
- **Monitoraggio EDR:** rilevare catene di processi anomale, impersonazione sospetta e comportamenti riconducibili all'esecuzione di codice privilegiato.
- **Incident response:** isolare il sistema compromesso, preservare le evidenze, verificare eventuali meccanismi di persistenza e ruotare le credenziali potenzialmente esposte.

In caso di compromissione confermata con privilegi SYSTEM, la sola eliminazione del processo sospetto non garantisce che il sistema sia tornato affidabile. Può essere necessario procedere a un ripristino da un'immagine attendibile.

## 8. Cosa ci insegna questo laboratorio?

Ripercorriamo la catena osservata.

| Fase | Evidenza ottenuta |
|---|---|
| Accesso MSSQL | Connessione riuscita con `mssqlclient.py` |
| Esecuzione comandi | `xp_cmdshell` disponibile |
| Identificazione account | `nt service\mssql$sqlexpress01` |
| Analisi privilegi | `SeImpersonatePrivilege Enabled` |
| Tecnica utilizzata | PrintSpoofer |
| Risultato finale | `nt authority\system` |

Il punto interessante è che **nessun singolo elemento, da solo, basta**: un servizio può avere SeImpersonate senza essere vulnerabile alla tecnica, si può trovare un vettore senza avere il privilegio, o avere credenziali SQL senza poter eseguire comandi. Qui le tre condizioni si sono presentate **insieme** — ed è la combinazione a portare a SYSTEM.

## Conclusioni

`SeImpersonatePrivilege` è uno di quei privilegi che passano inosservati a un'analisi superficiale: non dà privilegi amministrativi, non è una vulnerabilità e lo usano legittimamente molti servizi. Ma in un contesto compromesso può diventare l'anello decisivo di una local privilege escalation — come abbiamo visto, da un account MSSQL a `NT AUTHORITY\SYSTEM` con PrintSpoofer.

La lezione non riguarda lo strumento, ma **il modo in cui Windows gestisce identità e token tra processi con privilegi diversi**: il problema non è solo *quali privilegi* ha un account, ma *quali identità può impersonare*. Ecco perché, in un pentest Windows, l'analisi dei privilegi degli account di servizio è uno dei primi controlli da fare.

## Riferimenti e approfondimenti

- [Microsoft Learn — xp_cmdshell](https://learn.microsoft.com/en-us/sql/relational-databases/system-stored-procedures/xp-cmdshell-transact-sql)
- [Microsoft Learn — Impersonate a client after authentication](https://learn.microsoft.com/en-us/windows/security/threat-protection/security-policy-settings/impersonate-a-client-after-authentication)
- [PrintSpoofer — Repository ufficiale di itm4n](https://github.com/itm4n/PrintSpoofer)
- [Impacket — Repository ufficiale Fortra](https://github.com/fortra/impacket)
- [Microsoft Sysinternals — Sysmon](https://learn.microsoft.com/en-us/sysinternals/downloads/sysmon)

<aside class="readalso">
  <span class="readalso-k">Prossimo approfondimento</span>
  <a href="#">Windows Access Token: come funzionano privilegi, impersonation token e integrity level</a>
</aside>
