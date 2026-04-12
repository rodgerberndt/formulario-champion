

## Plan: Add Campaign Name to Creatives Tab + Campaign Filter

### What changes

The backend already returns a `campaigns: string[]` array per creative (from `utm_campaign` and `campaign_name` in ad_spend). We just need to surface it in the UI.

### 1. Show campaign names alongside creative name in the table (CreativesTab.tsx)

In the "Criativo" column cell (around line 1022-1033), add the campaign names below the creative key. Format: show campaigns as small badges or comma-separated text under the creative label.

Change the column header from "Criativo" to "Campanha / Criativo".

### 2. Add a campaign name multi-select filter (CreativesTab.tsx)

- Extract all unique campaign names from the loaded creatives data using `useMemo`.
- Add a new filter: a searchable dropdown/combobox (using the existing `Command`/`Popover` pattern already in the file for `LeadSearchPicker`) that lets you select one or more campaign names.
- New state: `selectedCampaigns: string[]`.
- Apply the filter: only show creatives whose `campaigns` array includes at least one of the selected campaigns (or show all if none selected).

### 3. Show campaign info in drill-down dialog

When clicking a creative to see details, show the list of campaigns that creative appears in.

### Files to edit
- `src/components/admin/CreativesTab.tsx` -- UI changes only (filter + display)

No backend changes needed -- data already available.

