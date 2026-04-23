# General Design Decisions
This is a document I am now starting to try to keep track of some decisions I made
and for the sake of code/API consistency should seek to continue to abide by.

<!-- TODO: Make use (and format it) of the keywords MUST, SHOULD, etc. -->

* Classes and Methods do generally not strive for maximum tamper protection
  * This would come with extra code and runtime overhead
  * We are using JavaScript – Realistically,
    there will always be a way to modify some value which in turn would violate a *trust boundary* or something
    * So (for now at least) we just assume for no trust boundary to exist. If you execute malicious/stupid code
      and violate the TypeScript types, *that's on you* (or something like that)
* lower-level API classes should accept 'raw' IDs instead of higher-level wrappers/constructs like ApolloUser
  * These are lower-level APIs. I don't want to instantiate a user or do a database request to get some extra
    data, if the lower-level API itself only uses the ID and ignores everything else
