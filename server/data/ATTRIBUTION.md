# Datakällor och licenser

Gatelog använder öppna data. Samma information finns i API:t: `GET /api/attributions`.

| Källa | Licens | Används till |
|---|---|---|
| [OurAirports](https://ourairports.com/data/) | Public Domain | Flygplatser (`airports.json`): IATA/ICAO, namn, ort, koordinater, typ, regioner |
| [OpenFlights](https://openflights.org/data.php) | [Open Database License (ODbL) 1.0](https://opendatacommons.org/licenses/odbl/1-0/) | Flygbolag (`airlines.json`): IATA/ICAO-koder och namn |
| [Natural Earth](https://www.naturalearthdata.com/) via [world-atlas](https://github.com/topojson/world-atlas) | Public Domain (world-atlas: ISC) | Landsgränser på kartor i klienten |

`airlines.json` är en bearbetad delmängd av OpenFlights airlines.dat (aktiva bolag med IATA-kod) och omfattas av ODbL:
databasen får delas och bearbetas om källan anges och bearbetade versioner delas under samma licens.
Ortnamn i `airports.json` har rättats på några ställen (se git-historiken).
