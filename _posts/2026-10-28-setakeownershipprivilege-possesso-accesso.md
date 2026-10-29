---
title: "Windows Privilege Escalation: leggere file protetti con SeTakeOwnershipPrivilege (takeown + icacls)"
date: 2026-10-28 21:00:00 +0200
categories: [Sicurezza]
image: /assets/img/setakeownership/cover.png
description: "Un privilegio dal nome tranquillo — «assumere la proprietà di file o altri oggetti» — permette di diventare proprietari di qualsiasi file e riscriverne i permessi fino a leggerlo. Vediamo come, perché funziona e come difendersi."
published: true
---

Un file può essere protetto da permessi che ne impediscono la lettura. Ma cosa succede se un utente, pur non potendo aprirlo, ha il diritto di diventarne proprietario?

È il problema che affrontiamo con **SeTakeOwnershipPrivilege**, un privilegio Windows pensato per recuperare il controllo di file e altri oggetti durante le attività amministrative.

Nelle circostanze sbagliate, però, questo diritto può permettere di superare le restrizioni imposte dalle autorizzazioni NTFS.

Nel modulo **[Windows Privilege Escalation di HTB Academy](https://academy.hackthebox.com/module/details/67)** ho analizzato proprio questo scenario: un account dispone del privilegio di acquisizione della proprietà, ma non ha accesso a un determinato file. L'obiettivo è capire se, sfruttando quel diritto, sia possibile raggiungerne il contenuto.

Il percorso del laboratorio è:

**Verifica del privilegio → abilitazione nel token → acquisizione della proprietà → modifica dei permessi → lettura del file.**

Vediamo perché questa sequenza funziona e cosa ci insegna sul modello di sicurezza di Windows.

> **Nota sull'utilizzo responsabile.** Le attività descritte sono state svolte esclusivamente in un ambiente di laboratorio autorizzato HTB Academy. I comandi sono riportati per finalità didattiche e di sicurezza difensiva. Qualsiasi verifica su sistemi di terzi richiede un'autorizzazione esplicita.

## 1. SeTakeOwnershipPrivilege: quando la proprietà conta più dei permessi

Windows utilizza un sistema di autorizzazioni per controllare l'accesso a file, cartelle e altri oggetti.

Ogni file NTFS dispone di un **proprietario** e di una lista di controllo degli accessi, chiamata **DACL** (*Discretionary Access Control List*), che stabilisce quali utenti possono leggerlo, modificarlo o eseguire altre operazioni.

In condizioni ordinarie, il proprietario di un oggetto ha un diritto particolare: **può modificarne le autorizzazioni anche se non dispone del permesso di lettura** sul contenuto. Questo comportamento è utile quando un amministratore deve recuperare l'accesso a file con permessi errati.

Il privilegio `SeTakeOwnershipPrivilege`, identificato nelle policy come *Take ownership of files or other objects*, consente a un account autorizzato di assumere la proprietà di oggetti protetti superando i normali controlli relativi al diritto `WRITE_OWNER`.

Per impostazione predefinita, Windows assegna questo privilegio agli amministratori. Può tuttavia essere **delegato** anche ad altri utenti o gruppi attraverso le policy di sicurezza.

È qui che emerge il rischio. Un account non amministrativo potrebbe non avere il permesso di leggere un determinato file, ma disporre comunque del diritto necessario per acquisirne la proprietà.

Diventare proprietari non significa ottenere automaticamente accesso ai dati. Significa, però, poter intervenire sulle regole che ne controllano l'accesso, nelle configurazioni ordinarie.

Esistono eccezioni, come le restrizioni applicate tramite il **SID `OWNER RIGHTS`**, che possono modificare i diritti impliciti del proprietario. Nel nostro laboratorio, tuttavia, il comportamento osservato segue il meccanismo standard.

## 2. Il laboratorio: individuare e abilitare il privilegio

Parto da un account Windows al quale è stato assegnato il diritto di assumere la proprietà degli oggetti.

Prima di intervenire sui file, controllo i privilegi disponibili nel token della sessione:

```cmd
whoami /priv
```

Tra i risultati compare:

```text
SeTakeOwnershipPrivilege    Take ownership of files or other objects    Disabled
```

![Output iniziale di whoami /priv con SeTakeOwnershipPrivilege disabilitato](/blog/assets/img/setakeownership/01-whoami-priv.png)
*Figura 1 — SeTakeOwnershipPrivilege è presente nel token, ma risulta disabilitato.*

Il risultato è significativo: il privilegio è disponibile, ma non ancora abilitato per le operazioni che lo richiedono.

Windows distingue infatti tra **privilegi presenti** e **privilegi attivi** nel token. Un'applicazione può abilitare quelli già disponibili, mentre non può aggiungerne arbitrariamente di nuovi.

Per osservare questo passaggio utilizzo gli script predisposti nel laboratorio:

```powershell
Import-Module .\Enable-Privilege.ps1
.\EnableAllTokenPrivs.ps1
whoami /priv
```

Dopo l'esecuzione, verifico nuovamente lo stato del token:

```text
SeTakeOwnershipPrivilege    Take ownership of files or other objects    Enabled
```

![Verifica del privilegio dopo l'abilitazione: ora Enabled](/blog/assets/img/setakeownership/02-enabled.png)
*Figura 2 — SeTakeOwnershipPrivilege risulta ora abilitato nel token corrente.*

Lo script utilizzato nell'ambiente didattico abilita i privilegi disponibili nel token. Non è una pratica da riprodurre indiscriminatamente sui sistemi di produzione: qui serve a rendere osservabile il cambiamento di stato.

A questo punto possiamo passare alla verifica più interessante: utilizzare il privilegio su un file al quale l'account non dispone inizialmente dell'accesso in lettura.

## 3. Da file protetto a file accessibile: takeown e icacls

Il file scelto per la dimostrazione si trova nel percorso `C:\TakeOwn\flag.txt`. Le autorizzazioni esistenti impediscono all'account di leggerne il contenuto.

Il primo passaggio consiste nell'assumerne la proprietà attraverso `takeown`, uno strumento integrato in Windows:

```cmd
takeown /f C:\TakeOwn\flag.txt
```

Il comando termina correttamente, confermando che la proprietà del file è stata acquisita. Provo quindi a leggerlo:

```cmd
type C:\TakeOwn\flag.txt
```

Il risultato è ancora un **accesso negato**. Perché?

Perché la **proprietà** e i **permessi di lettura** sono due cose differenti. Abbiamo modificato il proprietario del file, ma la sua DACL non è cambiata. Le autorizzazioni continuano quindi a impedire l'accesso al contenuto.

### Modificare le autorizzazioni con icacls

Per completare la dimostrazione utilizzo `icacls`, l'utilità Windows che permette di visualizzare e modificare le autorizzazioni NTFS.

Nella sessione PowerShell identifico l'account corrente e, come previsto dal laboratorio, gli assegno il controllo completo sul file:

```powershell
$utente = [System.Security.Principal.WindowsIdentity]::GetCurrent().Name
icacls 'C:\TakeOwn\flag.txt' /grant "${utente}:F"
```

L'opzione `F` indica *Full Control*, ossia controllo completo. Per una semplice lettura sarebbe sufficiente un'autorizzazione meno ampia, ma nel laboratorio utilizzo quella prevista dalla dimostrazione.

Ora ripeto il tentativo:

```powershell
type 'C:\TakeOwn\flag.txt'
```

Questa volta il contenuto viene visualizzato.

![Sequenza takeown, icacls e lettura del file](/blog/assets/img/setakeownership/03-takeown-read.png)
*Figura 3 — Dopo l'acquisizione della proprietà e la modifica della DACL, il file diventa leggibile. Il contenuto della flag è oscurato.*

Il risultato mostra chiaramente la differenza tra le due operazioni:

- **`takeown`** ha modificato il *proprietario* del file;
- **`icacls`** ha aggiornato le *autorizzazioni*.

Solo dopo questo secondo passaggio è stato possibile leggere il contenuto.

### Perché questa tecnica è importante?

In un ambiente reale, un file protetto potrebbe contenere informazioni molto più sensibili di una flag di laboratorio: configurazioni applicative, dati riservati, chiavi o credenziali archiviate in modo non sicuro.

Un account dotato di `SeTakeOwnershipPrivilege` potrebbe quindi compromettere la riservatezza di informazioni alle quali non era stato inizialmente autorizzato ad accedere.

La stessa logica può coinvolgere anche altri oggetti di Windows. Se un account riesce a modificare le autorizzazioni di risorse utilizzate da componenti privilegiati, possono emergere ulteriori rischi per l'integrità del sistema.

Questo, però, **non significa che `SeTakeOwnershipPrivilege` garantisca automaticamente l'esecuzione come SYSTEM**: un'eventuale escalation ulteriore richiederebbe condizioni aggiuntive. Nel nostro caso ci fermiamo alla lettura del file, che è sufficiente per dimostrare il problema.

## 4. Come difendersi

La difesa parte da un principio semplice: un account dovrebbe poter assumere la proprietà soltanto degli oggetti per i quali esiste una reale necessità operativa.

### Prevenzione: controllare privilegi e dati sensibili

Il primo passo è verificare a chi sia stato assegnato `SeTakeOwnershipPrivilege`. Sui sistemi Windows è possibile esportare la policy locale con:

```cmd
secedit /export /cfg C:\pol.cfg
```

Nel file generato occorre cercare la voce `SeTakeOwnershipPrivilege`. Questa verifica permette di individuare le assegnazioni presenti nella policy locale; negli ambienti di dominio è necessario controllare anche le Group Policy effettivamente applicate.

Il diritto dovrebbe essere riservato agli amministratori e agli eventuali account autorizzati che ne hanno un'esigenza documentata.

Altrettanto importante è **evitare di conservare segreti in chiaro** all'interno di file accessibili dai servizi o dagli utenti della macchina. Dove è necessaria una protezione aggiuntiva, la cifratura può ridurre le conseguenze della modifica dei permessi. Occorre però distinguere due tecnologie Windows:

- **EFS** (*Encrypting File System*) protegge singoli file attraverso chiavi crittografiche. La modifica della proprietà o della DACL non garantisce la possibilità di decifrarne il contenuto.
- **BitLocker** protegge il volume, soprattutto contro l'accesso offline ai dati. Non impedisce a un processo autorizzato dal sistema operativo di leggere un file quando il volume è già sbloccato.

Le due soluzioni hanno finalità differenti e non possono essere considerate intercambiabili.

### Rilevamento: monitorare proprietà e permessi

Un cambio di proprietà o una modifica inattesa della DACL può essere un segnale importante, soprattutto quando riguarda file che normalmente non vengono modificati. Windows permette di monitorare queste operazioni attraverso l'auditing del file system.

| Evento | Cosa osservare |
|---|---|
| Security Event ID 4670 | Modifiche alle autorizzazioni o al proprietario di un oggetto, quando sottoposte ad audit |
| Security Event ID 4656 | Richieste di accesso a oggetti monitorati |
| Security Event ID 4663 | Operazioni di accesso effettivamente registrate su oggetti monitorati |
| Sysmon Event ID 1 | Esecuzione di processi, inclusi `takeown.exe` e `icacls.exe` |

Per ottenere eventi utili è necessario configurare correttamente le policy di auditing e le **SACL** (*System Access Control List*) sui file e sulle directory sensibili. Senza questa configurazione, molte operazioni possono non produrre le evidenze attese.

Anche l'esecuzione di `takeown.exe` non costituisce necessariamente un'attività malevola: lo strumento viene utilizzato legittimamente dagli amministratori. Diventa più interessante quando viene eseguito da un account inatteso e seguito da modifiche ai permessi di file riservati. La **correlazione** tra utente, processo, file interessato e modifiche delle autorizzazioni consente di distinguere meglio le operazioni amministrative dagli abusi.

### Contenimento: ripristinare la sicurezza degli oggetti

Se viene rilevata un'acquisizione di proprietà non autorizzata, il primo obiettivo è ricostruire quali oggetti siano stati coinvolti e quali modifiche siano state apportate.

**Ripristinare soltanto il proprietario non è sufficiente**: occorre verificare anche la DACL, perché durante l'operazione potrebbero essere state aggiunte nuove autorizzazioni.

Se i file interessati contenevano password, chiavi o altri segreti, questi devono essere considerati potenzialmente esposti e gestiti secondo le procedure di risposta agli incidenti. È inoltre necessario controllare le altre attività dell'account coinvolto e correggere le assegnazioni di privilegio che hanno reso possibile l'operazione.

**WDAC** e **AppLocker** possono limitare l'esecuzione di programmi non autorizzati, ma non sostituiscono una corretta gestione dei diritti: `takeown` e `icacls` sono strumenti legittimi, presenti in Windows, e le stesse operazioni possono essere effettuate anche attraverso altre interfacce del sistema.

## 5. Conclusioni

Questo laboratorio ci ha permesso di osservare un aspetto importante del modello di sicurezza Windows: **proteggere un file attraverso i permessi non è sufficiente se un account non autorizzato dispone del potere di modificarli**.

Siamo partiti da un privilegio presente ma disabilitato nel token. Dopo averlo abilitato, abbiamo acquisito la proprietà di un file e modificato le sue autorizzazioni fino a renderlo leggibile.

La dimostrazione non ha richiesto una vulnerabilità software né ha comportato automaticamente l'acquisizione dei privilegi SYSTEM. È bastato utilizzare una funzionalità prevista dal sistema operativo, resa pericolosa dall'assegnazione di un diritto particolarmente potente.

La lezione va oltre `takeown` e `icacls`. Quando analizziamo la sicurezza di un account Windows, non dobbiamo limitarci a verificare quali file possa leggere o a quali gruppi appartenga. Dobbiamo considerare anche **quali autorizzazioni sia in grado di modificare**.

Perché, in alcuni casi, il modo più semplice per superare un controllo di accesso non è aggirarlo: è avere il privilegio di cambiarne le regole.

## Riferimenti e approfondimenti

- [Microsoft Learn — Take ownership of files or other objects (user right)](https://learn.microsoft.com/en-us/windows/security/threat-protection/security-policy-settings/take-ownership-of-files-or-other-objects)
- [Microsoft Learn — takeown](https://learn.microsoft.com/en-us/windows-server/administration/windows-commands/takeown)
- [Microsoft Learn — icacls](https://learn.microsoft.com/en-us/windows-server/administration/windows-commands/icacls)
- [Microsoft Learn — Security Identifiers (incl. Owner Rights)](https://learn.microsoft.com/en-us/windows-server/identity/ad-ds/manage/understand-security-identifiers)
- [Microsoft Learn — Audit File System](https://learn.microsoft.com/en-us/windows/security/threat-protection/auditing/audit-file-system)
- [Microsoft Sysinternals — Sysmon](https://learn.microsoft.com/en-us/sysinternals/downloads/sysmon)
- [MITRE ATT&CK — File and Directory Permissions Modification: Windows (T1222.001)](https://attack.mitre.org/techniques/T1222/001/)
