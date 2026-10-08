export const COMPLETE_ANIME_XML = `<?xml version="1.0" encoding="UTF-8"?><anime id="1" restricted="false">
  <type>TV Series</type>
  <episodecount>2</episodecount>
  <startdate>2023-10-22</startdate>
  <enddate>2024-03</enddate>
  <titles>
    <title xml:lang="x-jat" type="main">Kusuriya no Hitorigoto</title>
    <title xml:lang="en" type="official">The Apothecary Diaries</title>
    <title xml:lang="es-CA" type="synonym">Catalan Title</title>
  </titles>
  <relatedanime>
    <anime id="2" type="Sequel">Sequel Title</anime>
  </relatedanime>
  <similaranime>
    <anime id="3" approval="33" total="35">Similar Title</anime>
  </similaranime>
  <recommendations total="9">
    <recommendation type="Must See" uid="42">Great show</recommendation>
  </recommendations>
  <url>https://example.com/</url>
  <creators>
    <name id="4" type="Direction">Some Director</name>
  </creators>
  <description>Anime description</description>
  <ratings>
    <permanent count="2323">9.39</permanent>
    <temporary count="2354">8.58</temporary>
    <review count="2">7.41</review>
  </ratings>
  <picture>294282.jpg</picture>
  <resources>
    <resource type="2">
      <externalentity><identifier>111</identifier></externalentity>
      <externalentity><identifier>222</identifier></externalentity>
    </resource>
    <resource type="4">
      <externalentity><url>https://example.com/one</url></externalentity>
      <externalentity><url>https://example.com/two</url></externalentity>
    </resource>
  </resources>
  <tags>
    <tag id="5" parentid="6" infobox="true" weight="300" localspoiler="false" globalspoiler="false" verified="true" update="2020-10-04">
      <name>some tag</name>
      <description>Tag description</description>
      <picurl>123.jpg</picurl>
    </tag>
    <tag id="7" weight="0" localspoiler="true" globalspoiler="false" verified="false">
      <name>other tag</name>
      <resources>
        <resource type="44">
          <externalentity><identifier>tv</identifier><identifier>999</identifier></externalentity>
        </resource>
      </resources>
    </tag>
  </tags>
  <characters>
    <character id="8" type="main character in" update="2024-03-25">
      <rating votes="326">8.68</rating>
      <name>Maomao</name>
      <gender>female</gender>
      <charactertype id="1">Character</charactertype>
      <description>Character description</description>
      <picture>295636.jpg</picture>
      <seiyuu id="9" picture="11249.jpeg">Yuuki Aoi</seiyuu>
    </character>
  </characters>
  <episodes>
    <episode id="10" update="2023-10-25">
      <epno type="1">1</epno>
      <length>25</length>
      <airdate>2023-10-22</airdate>
      <rating votes="21">8.67</rating>
      <title xml:lang="en">Maomao</title>
      <title xml:lang="x-jat">Maomao</title>
      <summary>Episode summary</summary>
      <resources>
        <resource type="28"><externalentity><identifier>GMKUXQ2VM</identifier></externalentity></resource>
      </resources>
    </episode>
    <episode id="11" update="2024-01-01" recap="true">
      <epno type="2">S1</epno>
      <length>5</length>
      <title xml:lang="en">Special</title>
    </episode>
  </episodes>
</anime>`;

export const MINIMAL_ANIME_XML = `<?xml version="1.0" encoding="UTF-8"?><anime id="12" restricted="true">
  <type>TV Series</type>
  <episodecount>0</episodecount>
  <titles>
    <title xml:lang="x-jat" type="main">Minimal</title>
  </titles>
  <tags>
    <tag id="13" weight="0" localspoiler="false" globalspoiler="false" verified="false"><name>only tag</name></tag>
  </tags>
  <resources>
    <resource type="1"><externalentity><identifier>14</identifier></externalentity></resource>
  </resources>
</anime>`;
