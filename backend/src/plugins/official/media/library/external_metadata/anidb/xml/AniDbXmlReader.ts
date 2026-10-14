import { XMLParser } from 'fast-xml-parser';
import { singleton } from 'tsyringe';

/** @internal */
@singleton()
export class AniDbXmlReader {
  private readonly xmlParser = new XMLParser({
    ignoreAttributes: false,
    attributeNamePrefix: '@_',
    parseTagValue: false,
    parseAttributeValue: false,
    processEntities: true,
    htmlEntities: true,
    trimValues: true,
    alwaysCreateTextNode: true,
  });

  read(xml: string): unknown {
    return this.xmlParser.parse(xml);
  }
}
