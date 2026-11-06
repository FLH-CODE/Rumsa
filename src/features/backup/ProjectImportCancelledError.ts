/** Kastas när man själv väljer att avbryta en import (t.ex. tackar nej till att skriva över ett
 * redan befintligt projekt) – skiljs från riktiga fel så anroparen inte visar ett felmeddelande.
 * Egen, obetydlig fil (ingen jszip-import) så den går att importera statiskt där den behövs för
 * ett `instanceof`-test, utan att det drar in projectBackup.ts (och därmed jszip) i huvudbundlen –
 * se importProjectBackup i projectBackup.ts, som bara laddas in dynamiskt vid faktisk import. */
export class ProjectImportCancelledError extends Error {}
