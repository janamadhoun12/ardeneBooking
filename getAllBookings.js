import { GraphQLClient, gql } from 'graphql-request'
import { GenerateToken } from './generateToken.js';


// POs (adding POs to a given booking)
// match format (julians action add and update) 
// check if Pos are in db 
// if they are not then you have to create tsem one by one -> call julians create PO action 
// if they are already in db then call the Update bookings as per above format 

// Style numbers (adding SN to a given booking)




// cbm 



const query = gql`
query ($gte: DateTime!, $lt: DateTime!) {
    allBooking(
      where: {
        createdAt: { gteq: $gte, lt: $lt }
        _or: [
        { customer: { companyName: { eq: "Ardene Holdings Inc" } } },
        { customer: { companyName: { eq: "George Courey Inc" } } }
      ],
      forwarder: {companyName: { eq: "Power Logistics" } }
    }
    ) {
      results {
        primeFreightRef
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
        const tomorrow = new Date(Date.now() +1*864e5).toISOString().slice(0, 10);
        const gte = `${today}T00:00:00-04:00`;
        const lt  = `${tomorrow}T00:00:00-04:00`;

        const {jwtToken} = await this.auth.login();
        const client = new GraphQLClient(this.endpoint, {headers: {Authorization: `Bearer ${jwtToken}`}});
        const {allBooking} = await client.request(query, {gte, lt});
        
        
        return  allBooking.results
        .filter(b => b.packingList && b.packingList.url)
        .map(b => ({
          primeFreightRef: b.primeFreightRef,
          createdAt: b.createdAt,
          customer: b.customer,
          packingList: b.packingList
        }));
}
}
// export {GetAllBookings};

// style numbers - 10 
// update p