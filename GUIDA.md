# Il tuo blog su GitHub Pages

Indirizzo: **https://salvatoreluongo.github.io/blog**

Il blog è fatto con Jekyll, che GitHub Pages trasforma da solo in sito. Non serve installare niente: si scrive e si pubblica dal sito di GitHub, anche dal telefono.

---

## 1. Messa online (una volta sola)

1. Su GitHub crea un nuovo repository chiamato **`blog`**, **pubblico** e vuoto (senza README).
2. Carica i file di questa cartella: *Add file → Upload files*, poi trascina **il contenuto** della cartella (non la cartella stessa), compresi `_config.yml`, `_layouts`, `_includes` e `assets`, e fai *Commit changes*.
   > Le cartelle che iniziano con `_` sono indispensabili: se il tuo computer le nasconde, attiva "mostra file nascosti".
3. Vai su *Settings → Pages*. In **Source** scegli *Deploy from a branch*, poi branch **`main`** e cartella **`/ (root)`**, e salva.
4. Dopo 1-2 minuti il blog è online su `https://salvatoreluongo.github.io/blog`.

In `_config.yml` puoi cambiare titolo, descrizione e link social (per esempio il tuo profilo LinkedIn).

---

## 2. Scrivere un articolo

### Il modo comodo: l'editor della newsletter
Nella pagina dei preferiti premi **"Scrivi articolo"**:
1. l'AI legge l'articolo originale e prepara una prima bozza, con le righe «Da completare» dove inserire le tue prove;
2. nell'editor visuale correggi il testo e **incolli (Ctrl+V) o trascini gli screenshot**, che vengono caricati da soli in `assets/img/`;
3. scegli categorie e copertina, guardi l'**Anteprima** e premi **Salva bozza** o **Pubblica**.

L'editor scrive direttamente in questo repository: non serve toccare i file a mano.

### Il modo manuale: dal sito di GitHub
Apri `modello-articolo.md`, copia il contenuto e crea un nuovo file in `_posts` (*Add file → Create new file*) chiamato `AAAA-MM-GG-titolo-breve.md`.

Poi scrivi, nell'ordine:
1. **Le righe in alto tra i `---`**: titolo, categorie (es. `[Sicurezza, Windows]`), immagine di copertina e una descrizione di una frase.
2. **Il testo**, in Markdown:
   - `## Titoletto` per i titoli di sezione;
   - `**grassetto**`;
   - `- punto` per gli elenchi;
   - tre apici inversi per i blocchi di comandi.
3. **Gli screenshot.** Caricali nella cartella `assets/img/` (*Add file → Upload files*) e richiamali nel testo così:
   ```markdown
   ![Cosa mostra lo screenshot](/blog/assets/img/nome-file.png)
   *Didascalia facoltativa*
   ```
   Per la copertina, nelle righe in alto metti `image: /assets/img/nome-copertina.png` (senza `/blog`).

Finché c'è `published: false` l'articolo **non è visibile**: puoi salvarlo (*Commit changes*) quante volte vuoi.

## 3. Pubblicare

Cambia `published: false` in **`published: true`** e fai *Commit changes*. Dopo 1-2 minuti l'articolo è online, in home e nella sua categoria del menu.

Il menu delle categorie si aggiorna da solo, in base alle categorie che scrivi negli articoli.

## 4. Condividere su LinkedIn

Apri l'articolo pubblicato e premi il pulsante blu **in** sotto il titolo. LinkedIn mostra l'anteprima con copertina, titolo e descrizione: aggiungi due righe tue e pubblica.

> Se cambi la copertina e LinkedIn mostra ancora quella vecchia, aggiorna l'anteprima con il *Post Inspector* di LinkedIn: linkedin.com/post-inspector

---

## Struttura dei file

| Cartella o file | A cosa serve |
|---|---|
| `_posts/` | i tuoi articoli |
| `assets/img/` | copertine e screenshot |
| `_config.yml` | nome del blog, descrizione, link social |
| `modello-articolo.md` | modello da copiare per un nuovo articolo |
| `_layouts/`, `_includes/`, `assets/css/`, `assets/js/` | grafica del blog (non serve toccarli) |
