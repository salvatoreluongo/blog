---
title: "Windows Privilege Escalation: estrarre le credenziali con SeDebugPrivilege (LSASS + Mimikatz)"
date: 2026-10-28 20:00:00 +0200
categories: [Sicurezza]
image: /assets/img/sedebug/cover.png
description: "SeDebugPrivilege sembra un diritto da sviluppatori, ma può permettere di accedere alla memoria di LSASS ed estrarne un hash NTLM. Vediamo come, perché funziona e quali protezioni lo impediscono."
published: true
---

Ci sono privilegi Windows che, a prima vista, sembrano innocui. **SeDebugPrivilege** è uno di questi: il suo nome richiama il debugging, un'attività normalmente associata agli sviluppatori e alla diagnostica dei programmi.

Eppure, dietro questa funzione si nasconde un rischio importante. Il privilegio permette di superare determinati controlli di accesso ai processi e, nelle condizioni appropriate, di leggerne la memoria. Tra i possibili obiettivi c'è anche **LSASS**, uno dei componenti più sensibili del sistema operativo perché gestisce informazioni legate all'autenticazione degli utenti.

Per questo articolo ho utilizzato una macchina del modulo **[Windows Privilege Escalation di HTB Academy](https://academy.hackthebox.com/module/details/67)**, in cui questo diritto è configurato in modo da poter accedere alla memoria di LSASS e recuperare un hash NTLM attraverso ProcDump e Mimikatz.

Il percorso del laboratorio è il seguente:

**Accesso Windows → verifica di SeDebugPrivilege → dump di LSASS → analisi con Mimikatz → recupero dell'hash NTLM.**

Vediamo cosa succede, perché funziona e quali protezioni possono impedire che un privilegio legittimo diventi un rischio per le credenziali.

> **Nota sull'utilizzo responsabile.** Tutte le attività sono state svolte in un laboratorio autorizzato HTB Academy. Le tecniche descritte hanno finalità didattiche e difensive. Qualsiasi verifica su sistemi di terzi richiede un'autorizzazione esplicita.

## 1. SeDebugPrivilege: quando il debug diventa un rischio

Windows utilizza `SeDebugPrivilege`, identificato nelle policy come *Debug programs*, per consentire a determinati utenti di analizzare processi ai quali normalmente non potrebbero accedere.

È una funzionalità necessaria in alcune attività di sviluppo e amministrazione. Per impostazione predefinita, il diritto è assegnato agli amministratori, ma può essere concesso anche ad altri account tramite le policy di sicurezza.

Ed è proprio questo l'aspetto interessante: un utente non deve necessariamente appartenere al gruppo Administrators per possedere un privilegio particolarmente sensibile.

Il diritto di debug non rende automaticamente amministratori e non garantisce l'accesso a qualsiasi processo. Può però consentire operazioni molto invasive quando è presente e abilitato nel token, soprattutto su sistemi privi di protezioni aggiuntive.

Nel nostro caso, l'obiettivo è verificare se possa essere utilizzato per accedere alla memoria di LSASS.

## 2. Il punto di partenza: l'account jordan

Nel laboratorio utilizzo l'account Windows `jordan`, al quale è stato assegnato il diritto *Debug programs*.

Mi collego alla macchina tramite RDP e apro una **PowerShell elevata**, possibilità prevista dalla configurazione dell'account nell'ambiente di training.

È importante distinguere questo passaggio dal privilegio che stiamo esaminando: `SeDebugPrivilege` non permette, da solo, di avviare PowerShell come amministratore.

Windows gestisce infatti i privilegi attraverso gli **access token**, che determinano quali diritti siano effettivamente disponibili a un processo. Un privilegio può essere assegnato all'account, ma non comparire nel token utilizzato, oppure essere presente e risultare disabilitato. Nel caso degli account amministrativi soggetti a UAC, il token della sessione non elevata può essere filtrato, mentre quello elevato conserva i privilegi amministrativi.

Per verificare la situazione eseguo:

```cmd
whoami /priv
```

Tra i privilegi del token compare `SeDebugPrivilege   Debug programs   Enabled`.

![Output di whoami /priv con SeDebugPrivilege abilitato](/blog/assets/img/sedebug/01-whoami-priv.png)
*Figura 1 — SeDebugPrivilege risulta abilitato nel token della PowerShell elevata.*

Abbiamo quindi confermato che il processo dispone del privilegio necessario per il test. Rimane da capire se le protezioni del sistema consentano di utilizzarlo sul processo che ci interessa.

## 3. LSASS: perché la sua memoria è così importante?

LSASS, acronimo di *Local Security Authority Subsystem Service*, è un componente fondamentale dell'autenticazione Windows.

Il processo `lsass.exe` gestisce informazioni legate alle sessioni di accesso e, a seconda della configurazione, può mantenere in memoria materiale sensibile come **hash NTLM** e **ticket Kerberos**. In alcuni scenari meno protetti possono essere presenti anche credenziali in forma leggibile.

Questo lo rende un obiettivo particolarmente interessante durante un attacco: compromettere il materiale di autenticazione di un account può consentire ulteriori accessi, anche senza conoscere la password originale.

Naturalmente, Windows non lascia LSASS completamente indifeso. Una protezione importante è **Protected Process Light (PPL)**, che limita l'accesso al processo da parte di software non sufficientemente autorizzato. Quando LSASS viene eseguito in questa modalità, **il solo possesso di `SeDebugPrivilege` può non essere sufficiente** per leggerne la memoria.

Nel laboratorio, tuttavia, **le protezioni presenti non hanno impedito l'operazione**. Vediamo come è stato verificato.

## 4. Il dump della memoria con ProcDump

Per acquisire la memoria del processo utilizzo **[ProcDump](https://learn.microsoft.com/en-us/sysinternals/downloads/procdump)**, un'utility della suite Microsoft Sysinternals.

È uno strumento legittimo, normalmente impiegato per attività diagnostiche, ma il suo utilizzo su LSASS può esporre informazioni riservate.

Nel laboratorio eseguo:

```cmd
procdump.exe -accepteula -ma lsass.exe C:\Tools\lsass.dmp
```

L'opzione `-ma` richiede un **full dump**, mentre `C:\Tools\lsass.dmp` indica il file nel quale salvare il risultato. ProcDump completa l'operazione e conferma la creazione del dump.

![Output di ProcDump che genera il full dump di lsass.exe](/blog/assets/img/sedebug/02-procdump.png)
*Figura 2 — ProcDump completa l'acquisizione della memoria di LSASS e genera il file `lsass.dmp`.*

A questo punto disponiamo di una copia della memoria del processo, che potrà essere esaminata senza continuare a interagire direttamente con LSASS.

Il fatto che ProcDump sia un programma Microsoft firmato **non rende l'operazione invisibile**: gli strumenti EDR possono rilevare sia l'accesso al processo sia la creazione del file.

## 5. Analisi del dump con Mimikatz

Il passo successivo consiste nell'esaminare il contenuto del dump. Per farlo utilizzo **[Mimikatz](https://github.com/gentilkiwi/mimikatz)**, uno strumento molto conosciuto nell'ambito della sicurezza Windows, capace di analizzare determinate informazioni di autenticazione presenti nella memoria.

Nel laboratorio apro il file acquisito ed esamino i dati relativi alle sessioni di accesso:

```text
mimikatz.exe
log
sekurlsa::minidump C:\Tools\lsass.dmp
sekurlsa::logonpasswords
```

Tra i risultati compare l'**hash NTLM** associato all'account di servizio `sccm_svc`.

![Mimikatz analizza il dump e recupera il materiale di autenticazione di sccm_svc](/blog/assets/img/sedebug/03-mimikatz-sccm.png)
*Figura 3 — Mimikatz individua materiale di autenticazione associato all'account `sccm_svc`.*

### Perché recuperare un hash NTLM è così grave?

Un hash NTLM **non è una password in chiaro**. È un valore derivato dalla password e utilizzato nei meccanismi di autenticazione Windows.

In determinate condizioni, però, un attaccante può utilizzare direttamente questo materiale per tentare un'autenticazione NTLM, senza dover prima risalire alla password originale. È il principio alla base del **pass-the-hash**.

Questo non significa che qualsiasi hash recuperato garantisca l'accesso ad altri computer: il risultato dipende dai protocolli accettati, dalle autorizzazioni dell'account e dalle configurazioni di sicurezza dei sistemi di destinazione. Il rischio diventa particolarmente serio quando le stesse credenziali di servizio vengono riutilizzate su più macchine.

Nel nostro laboratorio, quindi, abbiamo dimostrato l'**esposizione di materiale di autenticazione sensibile**. Non abbiamo dimostrato automaticamente una successiva compromissione della rete, ma abbiamo individuato una condizione che potrebbe favorirla.

## 6. Come difendersi

Il modo più efficace per affrontare questa classe di attacchi è intervenire **prima** che un processo possa accedere alla memoria di LSASS, senza affidarsi esclusivamente al riconoscimento di strumenti come ProcDump o Mimikatz.

### Prevenzione: limitare privilegi ed esposizione

Il primo controllo riguarda l'assegnazione di `SeDebugPrivilege`. Questo diritto dovrebbe essere riservato agli account che ne hanno una reale necessità. È possibile esaminare le assegnazioni della policy locale esportandola con:

```cmd
secedit /export /cfg C:\pol.cfg
```

Nel file risultante occorre verificare la voce `SeDebugPrivilege`, tenendo presente che le policy effettive possono dipendere anche dalle impostazioni di dominio.

Una seconda misura riguarda la **protezione di LSASS**. **LSA Protection (RunAsPPL)** limita gli accessi non autorizzati alla memoria del processo, mentre **Credential Guard** utilizza la sicurezza basata sulla virtualizzazione per isolare determinate informazioni di autenticazione. Sono protezioni complementari, ma non equivalenti: Credential Guard non copre ogni tipologia di credenziale, compresi alcuni segreti degli account locali e quelli gestiti da applicazioni esterne ai suoi meccanismi.

È inoltre opportuno evitare l'accesso interattivo ai server con account altamente privilegiati, controllare le configurazioni che potrebbero esporre password in chiaro e utilizzare credenziali differenti tra sistemi. **Windows LAPS** aiuta a gestire le password degli amministratori locali, mentre **gMSA** può migliorare la gestione degli account di servizio di dominio.

### Rilevamento: quali eventi monitorare?

Un tentativo di accesso alla memoria di LSASS può produrre diversi segnali utili.

| Evento | Cosa osservare |
|---|---|
| Sysmon Event ID 10 | Accessi a `lsass.exe` da processi inattesi |
| Sysmon Event ID 11 | Creazione di file di dump sospetti |
| Sysmon Event ID 1 | Esecuzione di strumenti e catene di processi anomale |
| Windows Security 4688 | Creazione di processi, se l'auditing è configurato |

L'evento più interessante per questo scenario è il **Sysmon Event ID 10**, che registra quando un processo apre un handle verso un altro processo. **Non rappresenta, da solo, la prova di una lettura della memoria**: anche software legittimi possono accedere a LSASS.

Per questo è importante correlare il processo di origine, la **maschera di accesso** richiesta, gli eventuali file creati e gli altri eventi registrati sul sistema. La rilevazione diventa molto più affidabile quando questi elementi vengono analizzati insieme.

### Contenimento: cosa fare dopo un possibile dump

Se viene rilevata un'acquisizione sospetta della memoria di LSASS, occorre considerare **potenzialmente esposte le credenziali** presenti sul sistema.

La risposta dovrebbe prevedere l'**isolamento dell'host** secondo le procedure di incident response, la conservazione delle evidenze, la verifica di eventuali movimenti laterali e la **rotazione delle credenziali** coinvolte. Particolare attenzione va riservata agli account di servizio e agli account privilegiati, perché possono disporre di autorizzazioni su più sistemi.

Infine, controlli come **WDAC** e **AppLocker** possono limitare l'esecuzione di software non autorizzato, mentre la **segmentazione della rete** riduce le possibilità di propagazione di una compromissione.

## 7. Conclusioni

Questo laboratorio mostra come un privilegio pensato per una funzione legittima possa diventare un rischio concreto quando permette di raggiungere componenti che gestiscono informazioni sensibili.

Partendo dall'account `jordan`, abbiamo verificato la presenza di `SeDebugPrivilege` nel token elevato e osservato come l'accesso alla memoria di LSASS abbia consentito di recuperare un hash NTLM associato a un account di servizio.

L'aspetto più importante non è lo strumento utilizzato, ma ciò che il risultato dimostra: il possesso di determinati privilegi può esporre credenziali anche quando non viene acquisita direttamente una nuova identità amministrativa.

Per questo è essenziale distinguere tra **privilege escalation** e **credential access**. Nel nostro caso, l'operazione documentata riguarda soprattutto l'accesso a materiale di autenticazione, che potrebbe diventare il punto di partenza per ulteriori compromissioni.

La lezione è semplice: i privilegi Windows non vanno valutati soltanto in base al loro nome o alla funzione per cui sono stati creati, ma anche alle **risorse che permettono di raggiungere**. Un diritto concesso per analizzare i processi non dovrebbe mai trasformarsi in un accesso incontrollato alle credenziali del sistema.

## Riferimenti e approfondimenti

- [Microsoft Learn — Debug programs (user right)](https://learn.microsoft.com/en-us/windows/security/threat-protection/security-policy-settings/debug-programs)
- [Microsoft Learn — LSA Protection (RunAsPPL)](https://learn.microsoft.com/en-us/windows-server/security/credentials-protection-and-management/configuring-additional-lsa-protection)
- [Microsoft Learn — Credential Guard](https://learn.microsoft.com/en-us/windows/security/identity-protection/credential-guard/)
- [Microsoft Sysinternals — ProcDump](https://learn.microsoft.com/en-us/sysinternals/downloads/procdump)
- [Mimikatz — Repository ufficiale di gentilkiwi](https://github.com/gentilkiwi/mimikatz)
- [Microsoft Sysinternals — Sysmon](https://learn.microsoft.com/en-us/sysinternals/downloads/sysmon)
- [MITRE ATT&CK — OS Credential Dumping: LSASS Memory (T1003.001)](https://attack.mitre.org/techniques/T1003/001/)
