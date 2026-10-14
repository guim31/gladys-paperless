# Paperless-ngx

Suivez votre serveur de documents [Paperless-ngx](https://docs.paperless-ngx.com)
depuis Gladys, sur votre réseau local : combien de documents attendent dans la
boîte de réception, ce qui a été scanné aujourd'hui, si un scan a échoué — et
lancez une scène à l'arrivée d'un nouveau document, par exemple « une facture
d'EDF vient d'arriver ».

L'intégration ne fait que **lire** : elle ne crée, ne modifie et ne supprime
jamais un document, une étiquette ou une tâche dans Paperless-ngx.

> **Testée contre de vrais serveurs Paperless-ngx, pas encore dans un vrai
> Gladys : vos retours sont les bienvenus.** L'intégration a été développée et
> testée contre les images Docker officielles de Paperless-ngx 3.3.1 et
> 2.20.6, et contre le faux Gladys du SDK des intégrations. Si quelque chose
> ne marche pas comme décrit, dites-le sur le
> [forum Gladys](https://community.gladysassistant.com) ou dans les
> [issues](https://github.com/guim31/gladys-paperless/issues).

## Ce qu'il faut

- Gladys Assistant 5.1.0 ou plus récent.
- **Paperless-ngx 2.x ou 3.x**, joignable depuis Gladys (testé : 2.20.6 et
  3.3.1).
- Un **jeton d'API** d'un utilisateur de Paperless-ngx. Dans Paperless-ngx,
  cliquez sur votre nom (en haut à droite) → **Mon profil** → **Jeton
  d'authentification d'API** : créez-le s'il n'existe pas, puis copiez-le.

L'intégration voit ce que voit cet utilisateur : les documents qu'il possède
ou qui sont partagés avec lui, ses tâches et celles sans propriétaire.
Utilisez le jeton de l'utilisateur dont vous voulez suivre les documents ; le
jeton d'un **administrateur** donne en plus le stockage libre, que
Paperless-ngx ne montre qu'aux administrateurs.

## Mise en route

1. Installez l'intégration depuis le catalogue de Gladys.
2. Dans **Configuration**, saisissez l'**Adresse de Paperless-ngx** (par
   exemple `http://192.168.1.2:8000`, l'adresse avec laquelle vous ouvrez
   Paperless-ngx) et le **Jeton d'API**.
3. Enregistrez, puis cliquez sur **Tester la connexion** : le message sous le
   bouton donne la version, le nombre de documents et de tâches.
4. Ouvrez l'onglet **Découverte** : l'appareil **Paperless-ngx** y est.
   Cliquez sur **Ajouter**, choisissez une pièce, enregistrez.

Options :

- **Accepter les certificats auto-signés** : pour une adresse en `https://`
  servie avec votre propre certificat (un proxy inverse chez vous). Laissez
  décoché sinon.
- **Fréquence de rafraîchissement** : la fréquence de lecture de
  Paperless-ngx, de 30 secondes à 5 minutes (1 minute par défaut).
- **Vérifier les mises à jour de Paperless-ngx** : toutes les 6 heures,
  Paperless-ngx demande sa dernière version à GitHub (activé par défaut).
  Décochez et la question n'est jamais posée.
- **Langue des noms de fonctionnalités** : anglais, français, allemand ou
  espagnol. Les noms sont donnés à l'ajout de l'appareil (français par
  défaut).

## L'appareil Paperless-ngx

| Fonctionnalité                       | Ce que c'est                                                                      |
| ------------------------------------ | --------------------------------------------------------------------------------- |
| En ligne                             | 1 quand Paperless-ngx répond, 0 après deux lectures échouées de suite             |
| Nombre total de documents            | Tous les documents que l'utilisateur peut voir                                    |
| Documents dans la boîte de réception | Les documents qui portent une étiquette de boîte de réception : encore à classer  |
| Documents ajoutés aujourd'hui        | Les documents ajoutés depuis minuit (fuseau horaire de Gladys)                    |
| Tâches en cours                      | Tâches en attente ou en cours : scans en traitement, travaux planifiés            |
| Tâches en échec                      | Tâches en échec non masquées dans Paperless-ngx (Tâches de fichiers → Échec)      |
| Correspondants                       | Nombre de correspondants                                                          |
| Types de document                    | Nombre de types de document                                                       |
| Étiquettes                           | Nombre d'étiquettes                                                               |
| Stockage libre                       | Espace libre du stockage de Paperless-ngx, en Go (jeton administrateur seulement) |
| Mise à jour disponible               | 1 quand une version plus récente de Paperless-ngx est sortie (rien sans GitHub)   |
| Version                              | La version de Paperless-ngx, en texte                                             |

Chaque nombre garde son historique dans Gladys et peut piloter une scène
(« quand _Documents dans la boîte de réception_ dépasse 10… »).

## Tableau de bord

Le widget **Courrier à classer** montre trois tuiles — documents à classer,
ajoutés aujourd'hui, tâches en échec — et les derniers documents de la boîte
de réception avec leur correspondant et leur type (3, 5 ou 8, selon les
réglages du widget). Avec une adresse en `https://`, chaque document renvoie
vers Paperless-ngx, et un bouton **Ouvrir Paperless** l'ouvre ; Gladys
n'affiche que les liens en `https://`.

## Scènes

### Déclencheurs

- **Nouveau document dans Paperless-ngx** : un document a été ajouté (scan,
  e-mail, envoi). Filtres : **Correspondant** et **Type de document**, écrits
  exactement comme dans Paperless-ngx (majuscules comprises) ; laissés vides,
  tout document convient. Les actions suivantes peuvent lire
  `{{triggerEvent.data.title}}`, `correspondent`, `document_type`, `tags`
  (séparées par des virgules), `document_id` et `url` (le lien vers le
  document dans Paperless-ngx).
- **Nouveau document avec une étiquette** : la même chose, une fois par
  étiquette du nouveau document. Filtres : l'**Étiquette** (obligatoire) et,
  au choix, le **Correspondant**. Mêmes variables, plus `tag`. Paperless-ngx
  donne ses étiquettes de boîte de réception à chaque nouveau document : une
  scène sur l'étiquette « Inbox » démarre pour chaque nouveau document.
- **Échec du traitement d'un document** : Paperless-ngx n'a pas pu traiter
  un fichier (scan illisible, doublon…) ou l'une de ses tâches a échoué.
  Variables : `file_name` et `error`.

Les nouveaux documents sont repérés en comparant leur numéro au dernier vu ;
les tâches en échec aussi par leur numéro. Au plus 10 événements par
déclencheur et par lecture (un import massif ne lance pas une scène cent
fois), et rien de plus vieux que 24 heures. Ce qui existe au tout premier
démarrage de l'intégration n'est pas annoncé ; après un redémarrage, les
documents ajoutés entre-temps le sont.

### Actions

L'intégration n'a pas d'action de scène : elle ne fait que lire. Le bouton
**Tester la connexion** de l'écran Configuration lit Paperless-ngx tout de
suite et affiche un compte rendu.

### Idées de scènes

- **« Facture EDF reçue »** : déclencheur _Nouveau document dans
  Paperless-ngx_, Correspondant `EDF`, Type de document `Facture` → envoyer
  un message « Nouvelle facture EDF : {{triggerEvent.data.title}} ».
- **« Courrier urgent »** : déclencheur _Nouveau document avec une
  étiquette_, Étiquette `Urgent` → passer la lumière de l'entrée en orange.
- **« Le scanner a bourré »** : déclencheur _Échec du traitement d'un
  document_ → envoyer un message « Paperless n'a pas pu traiter
  {{triggerEvent.data.file_name}} ».
- **« Rappel de classement »** : chaque samedi à 10 h, continuer seulement
  si _Documents dans la boîte de réception_ est supérieur à 0 → envoyer un
  message.

## Requêtes envoyées à Paperless-ngx

À chaque lecture (chaque minute par défaut) : les statistiques, le nombre de
documents ajoutés aujourd'hui, les documents les plus récents des dernières
24 heures (25 au plus, sans leur contenu), les tâches en cours et celles en
échec — cinq requêtes GET légères (six avec Paperless-ngx 2.x). Toutes les
10 minutes, l'état du système (stockage), et toutes les 6 heures la dernière
version. Les noms des correspondants, types et étiquettes ne sont lus que
pour les nouveaux documents, et gardés une heure. Paperless-ngx n'impose
aucun quota de requêtes ; sur un petit NAS, choisissez une fréquence plus
longue.

## Dépannage

- **« Jeton d'API refusé »** : recopiez le jeton depuis Mon profil ; un jeton
  recréé remplace l'ancien. Un utilisateur désactivé est refusé aussi.
- **« Paperless-ngx ne répond pas »** : vérifiez l'adresse et le port depuis
  la machine de Gladys (`curl http://192.168.1.2:8000/api/`).
- **« L'adresse redirige »** : saisissez directement l'adresse en
  `https://`. Un portail de connexion (Authelia, Authentik…) devant
  Paperless-ngx doit laisser passer `/api/` avec le jeton.
- **« Certificat refusé »** : cochez _Accepter les certificats auto-signés_.
- **« Aucune API Paperless-ngx à cette adresse »** : l'adresse répond, mais
  pas avec Paperless-ngx (un sous-chemin manquant, un autre service sur le
  port).
- **Le stockage libre reste vide** : le jeton n'est pas celui d'un
  administrateur.
- **0 document alors que Paperless-ngx en a beaucoup** : l'utilisateur du
  jeton ne peut pas les voir (documents d'un autre propriétaire) : utilisez
  un autre jeton, ou partagez-les.
- **Mise à jour disponible reste vide** : Paperless-ngx n'a pas pu
  interroger GitHub (pas d'accès à Internet sur le serveur) ou la
  vérification est désactivée.
- Plus de détails : réglez `LOG_LEVEL=debug` sur le conteneur, les logs
  montrent alors chaque lecture. Le jeton n'est jamais écrit dans les logs.

## Limites

- Une seule instance de Paperless-ngx par installation de l'intégration.
- Lecture seule : ni envoi, ni étiquetage, ni masquage des tâches en échec
  depuis Gladys.
- Les filtres des déclencheurs comparent des noms exacts : `EDF` ne
  correspond pas à `edf`.
- Un document est annoncé une fois, quand il est vu pour la première fois ;
  une étiquette ajoutée plus tard à la main ne déclenche pas _Nouveau
  document avec une étiquette_.
- Paperless-ngx 1.x n'est pas pris en charge.
- Sans lien avec le projet Paperless-ngx.
