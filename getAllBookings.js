import { GraphQLClient, gql } from 'graphql-request'
import { GenerateToken } from './generateToken.js';

const query = gql`
query ($gte: DateTime!, $lt: DateTime!) {
    allBooking(
      where: {
        createdAt: { gteq: $gte, lt: $lt }
        customer: { companyName: { eq: "Ardene Holdings Inc" } }
      }
    ) {
      results {
        id
        createdAt
        customer { id companyName }
        packingList { name url }
      }
    }
  }
`;

export class GetAllBookings {
    constructor(endpoint) {
        this.endpoint = endpoint;
        this.auth = new GenerateToken(endpoint);
    }
    async getTodayBookings() {

        const today    = new Date().toISOString().slice(0, 10);
        const yesterday = new Date(Date.now() - 864e5).toISOString().slice(0, 10);
        const gte = `${yesterday}T00:00:00-04:00`;
        const lt  = `${today}T00:00:00-04:00`;

        const {jwtToken} = await this.auth.login();
        const client = new GraphQLClient(this.endpoint, {headers: {Authorization: `Bearer ${jwtToken}`}});
        const {allBooking} = await client.request(query, {gte, lt});
        return allBooking.results;
    }
}



//     query {
//     allBooking(
//         where: {
//         createdAt: {
//             gteq: "2025-05-12T00:00:00-04:00",
//             lt:   "2025-05-13T00:00:00-04:00"
//         },
//         customer: {
//             companyName: { eq: "Ardene Holdings Inc" }
//         }
//         }
//     ){
//         results { id createdAt customer { id companyName } packingList { name url }}
//     }
// }`;