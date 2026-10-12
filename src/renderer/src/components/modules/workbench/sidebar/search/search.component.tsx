import { useState } from 'react';
import { Tabs, TabsList, TabsTrigger } from '~/components/ui';
import { useSearchRun } from '~/lib/search';
import SearchField from './search-field.component';
import SearchReplace from './search-replace.component';
import SearchResults from './search-results.component';

type SubModule = 'search' | 'find-replace';

/**
 * Search across the project, in the sidebar.
 *
 * The walk itself happens in main — the renderer has no filesystem — and this
 * panel is the view of it: a query, three toggles, and the files it was found
 * in. The two tabs are two views of *one* search, not two searches: the query,
 * the options and the results are shared, so switching to Find & Replace keeps
 * the results already on screen and only adds the field that rewrites them.
 *
 * `useSearchRun` is mounted here, once, rather than in each tab, for the same
 * reason: two copies of it would debounce the same query twice.
 */
export default function GlobalSearch() {
  const [subModule, setSubModule] = useState<SubModule>('search');

  useSearchRun();

  return (
    <div className="flex h-full w-full shrink-0 flex-col p-1.5">
      <Tabs
        className="w-full shrink-0"
        value={subModule}
        onValueChange={(value) => setSubModule(value as SubModule)}
      >
        <TabsList className="w-full flex-1 gap-1">
          <TabsTrigger value="search" className="flex-1 cursor-pointer text-xs">
            Search
          </TabsTrigger>
          <TabsTrigger
            value="find-replace"
            className="flex-1 cursor-pointer text-xs"
          >
            Find &amp; Replace
          </TabsTrigger>
        </TabsList>
      </Tabs>

      {/* `min-h-0`, or the results list — a flex child that scrolls — grows to
          its content instead of to the panel, and takes the sidebar with it. */}
      <div className="flex min-h-0 flex-1 flex-col gap-1 pt-2">
        {subModule === 'search' ? (
          <SearchSubModule />
        ) : (
          <FindReplaceSubModule />
        )}
      </div>
    </div>
  );
}

function SearchSubModule() {
  return (
    <>
      <SearchField />
      <SearchResults />
    </>
  );
}

function FindReplaceSubModule() {
  return (
    <>
      <SearchField />
      <SearchReplace />
      {/* The same list, with a replace button on every file it draws. */}
      <SearchResults replaceable />
    </>
  );
}
