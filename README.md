# Retro-Amp

Retro-Amp est un lecteur audio web au look retro inspiré des players desktop, avec playlists persistées, égaliseur 10 bandes et visualiseur type Milkdrop dans le navigateur.

Le projet est séparé en deux parties :

- un backend FastAPI qui stocke les playlists, les métadonnées audio et les fichiers uploadés dans SQLite + système de fichiers ;
- un frontend React/Vite qui gère l'interface, la lecture audio HTML5, le graphe Web Audio et le visualiseur butterchurn.

## Ce que fait le projet

L'application permet de :

- créer, renommer et supprimer plusieurs playlists ;
- ajouter des morceaux par bouton ou par glisser-déposer ;
- réordonner les titres dans une playlist avec drag-and-drop ;
- supprimer une piste individuellement ;
- uploader une image de cover par playlist ;
- lire des fichiers MP3, M4A, OGG, WAV, FLAC et AAC ;
- contrôler lecture, pause, stop, piste suivante/précédente, volume et position de lecture ;
- appliquer un égaliseur 10 bandes avec presets ;
- afficher un visualiseur dynamique branché sur le flux audio via Web Audio API.

## Stack technique

### Frontend

- React 18
- TypeScript
- Vite
- Web Audio API
- butterchurn + butterchurn-presets
- @dnd-kit pour le drag-and-drop

### Backend

- Python
- FastAPI
- SQLModel
- SQLite
- mutagen pour lire les métadonnées audio

## Prérequis

Avant de lancer le projet, assure-toi d'avoir installé :

- Python 3
- Node.js et npm

Sous macOS, tu peux vérifier rapidement :

```bash
python3 --version
node --version
npm --version
```

Le projet crée automatiquement :

- un environnement virtuel Python dans `backend/.venv` ;
- les dépendances Python du backend ;
- les dépendances Node du frontend dans `frontend/node_modules`.

## Lancer le projet de A à Z

### Option rapide

Depuis la racine du projet, tu peux maintenant lancer tout le projet avec une seule commande :

```bash
./run.sh
```

Ce script démarre en parallèle :

- le backend sur `http://localhost:8787` ;
- le frontend sur `http://localhost:5173`.

Pour arrêter l'ensemble, utilise `Ctrl+C`.

### 1. Cloner le dépôt

```bash
git clone https://github.com/jrj37/lecteur_musical.git
cd lecteur_musical
```

Si tu travailles déjà dans le dossier local, passe directement à l'étape suivante.

### 2. Démarrer le backend

Ouvre un premier terminal à la racine du projet :

```bash
cd backend
./run.sh
```

Ce script fait automatiquement les actions suivantes :

- création de `backend/.venv` si l'environnement virtuel n'existe pas ;
- activation de l'environnement ;
- installation des dépendances de `requirements.txt` ;
- lancement du serveur FastAPI avec Uvicorn sur le port `8787`.

Le backend est ensuite disponible sur :

```text
http://localhost:8787
```

### 3. Démarrer le frontend

Ouvre un second terminal, toujours à la racine du projet :

```bash
cd frontend
./run.sh
```

Ce script :

- installe les dépendances npm si `node_modules` n'existe pas encore ;
- lance Vite en mode développement.

Le frontend est disponible sur :

```text
http://localhost:5173
```

### 4. Ouvrir l'application

Dans ton navigateur, ouvre :

```text
http://localhost:5173
```

Le frontend appelle automatiquement le backend via le proxy Vite sur `/api`, redirigé vers `http://localhost:8787`.

### 5. Premier usage

Une fois l'application ouverte :

1. crée ou sélectionne une playlist ;
2. clique sur `LOAD FILES` ou glisse des fichiers audio dans la fenêtre ;
3. clique sur un morceau pour lancer la lecture ;
4. ajuste le volume, la position et l'égaliseur ;
5. clique sur la cover pour en uploader une si besoin.

## Fonctionnement du projet

### Backend

Le backend expose une API REST pour gérer :

- les playlists ;
- les pistes audio ;
- l'ordre des morceaux ;
- les covers ;
- le streaming des fichiers audio.

Concrètement :

- les playlists et pistes sont stockées dans SQLite ;
- les fichiers audio sont copiés dans `backend/data/tracks/` ;
- les images de cover sont copiées dans `backend/data/covers/` ;
- les métadonnées comme le titre, l'artiste, l'album ou la durée sont extraites via `mutagen`.

Le backend initialise automatiquement la base au démarrage si elle n'existe pas encore.

### Frontend

Le frontend fournit toute l'interface utilisateur et pilote la lecture audio côté navigateur.

La lecture repose sur deux éléments :

- un élément HTML `<audio>` pour la lecture effective du fichier ;
- un moteur Web Audio qui insère le gain, les filtres de l'égaliseur et les analyseurs audio.

Le visualiseur s'appuie sur butterchurn, connecté à un `AnalyserNode`, pour afficher des presets animés façon Milkdrop. Le rendu est enrichi par une couche visuelle WebGL supplémentaire pour l'ambiance graphique.

## Ports et données générées

### Ports utilisés

- frontend : `5173`
- backend : `8787`

### Données générées localement

Les données persistées sont stockées dans :

```text
backend/data/
```

On y retrouve notamment :

- `retroamp.db` : base SQLite ;
- `tracks/` : fichiers audio uploadés ;
- `covers/` : images de couverture.

## Réinitialiser le projet localement

Pour supprimer toutes les playlists, covers et pistes uploadées localement :

```bash
rm -rf backend/data
```

Au prochain lancement du backend, le dossier et la base seront recréés automatiquement.

## Arborescence utile

```text
music/
├── README.md
├── backend/
│   ├── app/
│   │   ├── main.py
│   │   ├── models.py
│   │   ├── db.py
│   │   └── __init__.py
│   ├── data/
│   ├── requirements.txt
│   └── run.sh
└── frontend/
    ├── src/
    │   ├── App.tsx
    │   ├── PlaylistView.tsx
    │   ├── Visualizer.tsx
    │   ├── audio.ts
    │   ├── api.ts
    │   ├── styles.css
    │   ├── types.ts
    │   └── main.tsx
    ├── package.json
    ├── vite.config.ts
    └── run.sh
```

## Dépannage rapide

### Le visualiseur ne démarre pas

Le navigateur bloque l'initialisation complète de `AudioContext` tant qu'il n'y a pas eu d'interaction utilisateur. Clique dans l'interface puis lance un morceau.

### Aucun son ou comportement étrange après un upload

Vérifie que le backend tourne bien sur le port `8787` et que le frontend tourne bien sur `5173`.

### Les sliders verticaux s'affichent différemment selon le navigateur

Le rendu est meilleur sur Chrome et Safari. Firefox gère partiellement certains styles natifs des sliders verticaux.

## Résumé

Retro-Amp est un lecteur musical web local orienté expérience visuelle et manipulation de playlists. Il combine un backend simple pour stocker les données et un frontend plus riche qui gère l'audio, l'égaliseur et les animations en temps réel directement dans le navigateur.
