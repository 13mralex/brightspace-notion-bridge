//ES6 Imports
//import { Client as notionClient } from "@notionhq/client"
//import fetch from 'node-fetch'
//import * as appwrite from 'node-appwrite'
//import deepDiff from "deep-diff"

//

//Module Imports
const notionClient = require("@notionhq/client");
const appwrite = require("node-appwrite");
const deepDiff = require("deep-diff");

//Variables
const updates = []
var idMap;
const tzShort = "EDT"
const tzLong = "America/Indiana/Indianapolis"
const locale = "en-US"

//Semesters
const today = new Date()
const year = today.getFullYear()
const springSemester = {
    start: new Date('Jan 01 '+ year),
    end: new Date('May 31 '+ year)
}
const summerSemester = {
    start: new Date('Jun 01 '+ year),
    end: new Date('Jul 31 '+ year)
}
const fallSemester = {
    start: new Date('Aug 01 '+ year),
    end: new Date('Dec 31 '+ year)
}


//Appwrite query to max limit from 25 to 100
const awQuery = [appwrite.Query.limit(100)]

const notion = new notionClient.Client({
  auth: process.env.NOTION_KEY
})

const appwriteClient = new appwrite.Client()
const appwriteDb = new appwrite.Databases(appwriteClient)

appwriteClient
    .setEndpoint(process.env.APPWRITE_ENDPOINT)
    .setProject(process.env.APPWRITE_PROJECT)
    .setKey(process.env.APPWRITE_KEY)
    .setSelfSigned(true)
;

module.exports = async function (req, res) {

    console.log('Calling main function...')

    main()

    await res.json({
      updated: true,
      updates: updates
    });
  };

async function main() {

    console.log("Main function...")

    const data = await notion.users.list()


    //console.log("Notion data:",data)

    //const users = await appwriteDb.listDocuments('users','userInfo')
    const users = await getDocuments('users','userInfo')

    //console.log('user:',users[0])

    //generatePageStructure(users.documents[0])

    const user = users[0]

    pageflow(user)
}

async function pageflow(user) {

    console.log("Page flow...")

    user.idMap = await getDocuments('notionIds',user.userId)

    const parentPage = await generateParentPage(user)

    //const coursesPage = await generateCoursesPages(user,parentPage)

    const activitiesPage = await generateActivitiesPages(user,parentPage)

    //resetActivities(user)

    //resetUpdates(user)

    const feedPage = await generateFeedPages(user,parentPage)

    //test(user)


}

async function generateParentPage(user) {

    console.log("Updating parent page...")

    const pageId = user.notionPageId

    const currentPage = await notion.pages.retrieve({
        page_id: pageId
    })

    const coverUrl = 'https://catalog.purdue.edu/mime/media/13/4238/pwl%20catalog%20main.jpg'

    //Get Org details
    const query =
    `query GetOrganization {
        rootOrganization {
            homeUrl
            imageUrl
            name
            color
            code
            theme {
            color
            imageLink
            }
        }
    }`
    const org = await brightspaceQuery(query,user.token)

    var page = {}

    page.page_id = pageId

    page.cover = {
        type: "external",
        external: {
            url: coverUrl
        }
    }

    page.icon = {
        type: "external",
        external: {
          url: "https://media-exp1.licdn.com/dms/image/C4E0BAQGUO9Kvy1lfEA/company-logo_200_200/0/1619705137869?e=2159024400&v=beta&t=2pj8ESaDz4XldjkclCz7GG7_kx5bFdsI3l_761Lnles"
        }
    }

    page.properties = {
        title: {
            title: [{
                text: {
                    content: org.rootOrganization.name
                }
            }]
        }
    }

    const newPage = await notion.pages.update(page)

    const data = {
        organizationCode: org.rootOrganization.code
    }

    //console.log('user:',user)

    appwriteDb.updateDocument('users','userInfo',user['$id'],data)

    //console.log('Page:',newPage)

    //console.log('New Page:',JSON.stringify(await notion.blocks.children.list({block_id: '93c25a2b-eb6c-4aa5-9baa-c9b4947b871a'}),null,2))

    return newPage
}

async function generateCoursesPages(user,parentPage) {

    const parentPageId = parentPage.id

    var coursesPage;

    //console.log("UserID:",user.userId)

    //var idMap = await appwriteDb.listDocuments('notionIds',user.userId,awQuery)
    //var idMap = await getDocuments('notionIds',user.userId)
    //idMap = idMap.documents


    if (!user.notionCoursesDbId) {
        console.log('Courses db not found')

        //Create courses DB in notion

        const notionCoursesDb = {
            "parent": {
                type: "page_id",
                page_id: parentPage.id
            },
            title: [{
                type: "text",
                text: {
                    content: "Courses"
                }
            }],
            is_inline: true,
            properties: {
                Name: {
                    title: {}
                },
                "Start": {
                    date: {}
                },
                "End": {
                    date: {}
                },
                "Pinned": {
                    select: {
                        options: [
                            {
                                name: "Yes",
                                color: "green"
                            },
                            {
                                name: "No",
                                color: "red"
                            }
                        ]
                    }
                },
                "Course Homepage": {
                    url: {}
                }
            }
        }

        coursesPage = await notion.databases.create(notionCoursesDb)

        const data = {
            notionCoursesDbId: coursesPage.id
        }
        appwriteDb.updateDocument('users','userInfo',user['$id'],data)
    } else {
        const data = {
            database_id: user.notionCoursesDbId
        }
        coursesPage = await notion.databases.retrieve(data)
    }


    //console.log('Notion DB:', coursesPage)

    //Get Courses
    const query =
    `
    query GetCourses {
        enrollmentPage {
          enrollments {
            id
            pinned
            endDate
            startDate
            state
            organization {
              name
              theme {
                color
                imageLink
              }
              imageUrl
              homeUrl
              id
              startDate
              endDate
            }
          }
        }
      }
    `

    var courses = await brightspaceQuery(query,user.token)
    courses = courses.enrollmentPage.enrollments


    //Filter non past courses
    for (const course of courses.filter(x => x.state != "PAST")) {
        console.log('***')

        console.log('Active Course:',course.organization.name)

        //console.log('Start date:',course.startDate)
        //console.log('--End date:',course.endDate)

        const page = {}


        page.parent = {
            type: "database_id",
            database_id: coursesPage.id
        }
    

        //Ignore cover if within organization, due to auth

        if (!course.organization.imageUrl.search(`${user.organizationCode}.brightspace.com`)) {
            page.cover = {
                type: "external",
                external: {
                    url: course.organization.imageUrl
                }
            }
        }
    
        page.properties = {
            title: {
                title: [{
                    text: {
                        content: course.organization.name
                    }
                }]
            },
            "Course Homepage": {
                url: course.organization.homeUrl
            }
        }

        //Only update dates if given
        if (course.startDate) {
            page.properties["Start"] = {
                date: {
                    start: getDate(course.startDate),
                    time_zone: tzLong
                }
            }
        }
        if (course.endDate) {
            page.properties["End"] = {
                date: {
                    start: getDate(course.endDate),
                    time_zone: tzLong
                }
            }
        }

        //Update pinned
        if (course.pinned) {
            page.properties["Pinned"] = {
                select: {
                    name: "Yes"
                }
            }
        } else {
            page.properties["Pinned"] = {
                select: {
                    name: "No"
                }
            }
        }

        //Update page if exists, create otherwise
        const existingPage = user.idMap.filter(x => x.brightspaceId == course.organization.id)[0]
        if (existingPage) {
            //console.log('Page exists:',existingPage)
            console.log('Course page exists:',course.organization.name)
            page.page_id = existingPage.notionPageId
            const pageObject = await notion.pages.update(page)
        } else {
            console.log("Page doesn't exist")
            console.log('Course page does not exist:',course.organization.name)
            const pageObject = await notion.pages.create(page)

            const docData = {
                name: course.organization.name,
                notionPageId: pageObject.id,
                brightspaceId: course.organization.id,
                type: "course",
                rawData: JSON.stringify(course)
            }

            appwriteDb.createDocument('notionIds',user.userId,appwrite.ID.unique(),docData)
        }

        console.log('***')


    }



    return coursesPage

}


async function generateActivitiesPages(user,parentPage) {

    console.log('Updating activities...')

    const parentPageId = parentPage.id

    var activitiesPage;

    //console.log("UserID:",user.userId)

    //var idMap = await appwriteDb.listDocuments('notionIds',user.userId,awQuery)
    //var idMap = await getDocuments('notionIds',user.userId)
    //idMap = idMap.documents

    //console.log("Courses:",courses)

    if (!user.notionActivitiesDbId) {
        console.log('Activities db not found')

        //Create activities DB in notion

        //Get courses for select property
        var courses = []
        const filteredCourses = user.idMap.filter(x => x.type == 'course')
        const colors = ['gray', 'brown', 'orange', 'yellow', 'green', 'blue', 'purple', 'pink', 'red']
        const shuffledColors = colors.sort((a, b) => 0.5 - Math.random())

        var courseIndex = 0
    
        for (const course of filteredCourses) {

            courseIndex++

            const newCourse = {
                name: course.name,
                color: shuffledColors[courseIndex]
            }

            //Reset i if num colors reached
            if (courseIndex > colors.length) {
                courseIndex = 0
            }

            courses.push(newCourse)
            console.log('Pushing course:',newCourse)
        }

        const notionActivitiesDb = {
            "parent": {
                type: "page_id",
                page_id: parentPage.id
            },
            title: [{
                type: "text",
                text: {
                    content: "Assignments"
                }
            }],
            is_inline: true,
            properties: {
                Name: {
                    title: {}
                },
                "Course": {
                    select: {
                        options: courses
                    }
                },
                "Available": {
                    date: {}
                },
                "Due": {
                    date: {}
                },
                "Type": {
                    select: {
                        options: [
                            {
                                name: "Homework",
                                color: "orange"
                            },
                            {
                                name: "Quiz",
                                color: "purple"
                            },
                            {
                                name: "Project",
                                color: "pink"
                            },
                            {
                                name: "Exam",
                                color: "red"
                            },
                            {
                                name: "Lab",
                                color: "blue"
                            }
                        ]
                    }
                },
                "Status": {
                    select: {
                        options: [
                            {
                                name: "Not Started",
                                color: "red"
                            },
                            {
                                name: "Started",
                                color: "yellow"
                            },
                            {
                                name: "Finished not Submitted",
                                color: "blue"
                            },
                            {
                                name: "Submitted",
                                color: "green"
                            },
                            {
                                name: "Dropped",
                                color: "gray"
                            }
                        ]
                    }
                },
                "Assignment Link": {
                    url: {}
                }
            }
        }

        activitiesPage = await notion.databases.create(notionActivitiesDb)

        const data = {
            notionActivitiesDbId: activitiesPage.id
        }
        appwriteDb.updateDocument('users','userInfo',user['$id'],data)
    } else {
        const data = {
            database_id: user.notionActivitiesDbId
        }
        activitiesPage = await notion.databases.retrieve(data)
    }

    //console.log('Notion DB:', activitiesPage)


    //Start populating activities


    //Get Activites
    const query =
    `
    query GetActivities {
        activities(start: "${getSemester().start}", end: "${getSemester().end}") {
          dueDate
          endDate
          id
          startDate
          source {
            name
            id
            url
            descriptionHtmlRichContent
            descriptionHtml
            description
          }
          gradeInfo {
            type
            value
          }
          feedback {
            text
            viewUrl
          }
          completed
          completionDate
          organization {
            id
            name
          }
        }
      }
    `

    var activities = await brightspaceQuery(query,user.token)
    activities = activities.activities

    //console.log('Activities:',activities)

    //Start page generation
    for (const activity of activities.filter(x => x.source != null)) {

        var page = await generateActivityPage(activity,activitiesPage)

        //Update page if exists, create otherwise
        const existingPage = user.idMap.filter(x => x.brightspaceId == activity.id)[0]
        if (existingPage) {


            //console.log('Page exists:',existingPage)
            //console.log('Activity page exists:',activity.source.name)

            const existingPageData = JSON.parse(existingPage.rawData)

            const diff = deepDiff.diff(existingPageData,activity)

            //Check for differences, update if so
            if (diff) {
                console.log('Activity updated:',activity.source.name)

                console.log('DeepDiff:',diff)

                /* console.log('Original due date: ',activity.dueDate)
                console.log('Converted due date:',getDate(activity.dueDate)) */

                page.page_id = existingPage.notionPageId
                const pageObject = await notion.pages.update(page)

                updates.push({
                    activity: activity.source.name,
                    type: "update",
                    diff: diff
                })

                //Update DB
                const data = {
                    rawData: JSON.stringify(activity)
                }
                appwriteDb.updateDocument('notionIds',user.userId,existingPage['$id'],data)

            } else {
                //console.log('Pages match. Not updating')
            }


            
        } else {
            //console.log("Activity page doesn't exist")
            console.log('Activity created:',activity.source.name)

            //console.log('Page:',page)

            const pageObject = await notion.pages.create(page)

            updates.push({
                activity: activity.source.name,
                type: "create"
            })

            const docData = {
                name: activity.source.name,
                notionPageId: pageObject.id,
                brightspaceId: activity.id,
                type: "activity",
                rawData: JSON.stringify(activity)
            }

            appwriteDb.createDocument('notionIds',user.userId,appwrite.ID.unique(),docData)
        }

    }

}


async function generateActivityPage(activity,parentPage) {

    var activityType;
    var dueDate;
    var activityStatus;
    var activityDescription;

    //Determine activity type
    if (activity.source.name.toLowerCase().includes('exam')) {
        activityType = 'Exam'
    } else if (activity.source.name.toLowerCase().includes('lab')) {
        activityType = 'Lab'
    } else if (activity.source.name.toLowerCase().includes('quiz')) {
        activityType = 'Quiz'
    } else if (activity.source.name.toLowerCase().includes('project')) {
        activityType = 'Project'
    } else {
        activityType = 'Homework'
    }

    //Determine if submitted
    if (activity.completed || activity.completionDate) {
        activityStatus = "Submitted"
    } else {
        activityStatus = "Not Started"
    }

    //Determine description
    if (activity.source.description) {
        activityDescription = activity.source.description
    } else {
        activityDescription = 'No description'
    }

    const charlimit = 1990
    //Clip if over 2000 chars
    if (activityDescription.length > charlimit) {
        activityDescription = activityDescription.substring(0,charlimit) + '[clipped]'
    }

    var page = {
        "parent": {
            type: "database_id",
            database_id: parentPage.id
        },
        title: [{
            type: "text",
            text: {
                content: activity.source.name
            }
        }],
        properties: {
            Name: {
                title: [{
                    text: {
                        content: activity.source.name
                    }
                }]
            },
            "Course": {
                select: {
                    name: activity.organization.name
                }
            },
            "Type": {
                select: {
                    name: activityType
                }
            },
            "Status": {
                select: {
                    name: activityStatus
                }
            },
            "Assignment Link": {
                url: activity.source.url
            }
        },
        children: [
            {
                object: "block",
                callout: {
                    rich_text: [
                        {
                            type: "text",
                            text: {
                                content: activityDescription
                            }
                        }
                    ],
                    icon: {
                        emoji: '💡'
                    },
                    color: "default"
                }
            }
        ]
    }



    if (activity.startDate) {
        page.properties["Available"] = {
            date: {
                start: getDate(activity.startDate),
                time_zone: tzLong
            }
        }
    }

    if (activity.endDate) {
        page.properties["Due"] = {
            date: {
                start: getDate(activity.endDate),
                time_zone: tzLong
            }
        }
    } else if (activity.dueDate) {
        page.properties["Due"] = {
            date: {
                start: getDate(activity.dueDate),
                time_zone: tzLong
            }
        }
    }

    return page

}

async function generateFeedPages(user,parentPage) {

    console.log('Updating updates...')
    
    var updatesPage;

    //console.log("UserID:",user.userId)

    //var idMap = await appwriteDb.listDocuments('notionIds',user.userId,awQuery)
    //var idMap = await getDocuments('notionIds',user.userId)
    //idMap = idMap.documents


    if (!user.notionUpdatesDbId) {
        console.log('Updates db not found')

        //Create feed DB in notion

        const notionUpdatesDb = {
            "parent": {
                type: "page_id",
                page_id: parentPage.id
            },
            title: [{
                type: "text",
                text: {
                    content: "Updates"
                }
            }],
            is_inline: true,
            properties: {
                Name: {
                    title: {}
                },
                "Date": {
                    date: {}
                },
                "Course": {
                    select: {}
                },
                "Link": {
                    url: {}
                }
            }
        }

        updatesPage = await notion.databases.create(notionUpdatesDb)

        const data = {
            notionUpdatesDbId: updatesPage.id
        }
        appwriteDb.updateDocument('users','userInfo',user['$id'],data)
    } else {
        const data = {
            database_id: user.notionUpdatesDbId
        }
        updatesPage = await notion.databases.retrieve(data)
    }


    //console.log('Notion DB:', feedPage)

    //Get Notifications
    const query =
    `
    query GetNotifications {
        updateAlertsPage {
          alerts {
            title
            message
            date
            viewUrl
            id
            organization {
              name
            }
          }
        }
      }
    `

    var updates = await brightspaceQuery(query,user.token)
    updates = updates.updateAlertsPage.alerts


    //Start page generation
    for (const update of updates.filter(x => x.title != null)) {

        //console.log("Update:",update)

        var updateTitle = update.title || 'No title'
        var updateDescription = update.message || 'No description'

        const charlimit = 1990
        //Clip if over 2000 chars
        if (updateDescription.length > charlimit) {
            updateDescription = updateDescription.substring(0,charlimit) + '[clipped]'
        }

        //Change title based on type
        //Depcrecated
        /* if (update.type == 'GRADE') {
            updateTitle = `Grade updated: ${update.title}`
            updateDescription = `Updated score: ${update.description}`
        } else if (update.type == 'DROPBOXDUEDATEAPPROACHING' || update.type == 'QUIZDUEDATEAPPROACHING') {
            updateTitle = `Due date approaching: ${update.title}`
        } else if (update.type == 'DROPBOXENDDATEAPPROACHING' || update.type == 'QUIZENDDATEAPPROACHING') {
            updateTitle = `End date approaching: ${update.title}`
        } else if (update.type == 'CONTENTADDED') {
            updateTitle = `Content added: ${update.title}`
        } */

        var page = {
            "parent": {
                type: "database_id",
                database_id: user.notionUpdatesDbId
            },
            title: [{
                type: "text",
                text: {
                    content: updateTitle
                }
            }],
            properties: {
                Name: {
                    title: [{
                        text: {
                            content: updateTitle
                        }
                    }]
                },
                "Course": {
                    select: {
                        name: update.organization.name
                    }
                },
                "Date": {
                    date: {
                        start: getDate(update.date),
                        time_zone: tzLong
                    }
                },
                "Link": {
                    url: update.viewUrl
                }
            },
            children: [
                {
                    object: "block",
                    callout: {
                        rich_text: [
                            {
                                type: "text",
                                text: {
                                    content: updateDescription
                                }
                            }
                        ],
                        icon: {
                            emoji: '❕'
                        },
                        color: "default"
                    }
                }
            ]
        }

        //Update page if exists, create otherwise
        const existingPage = user.idMap.filter(x => x.brightspaceId == update.id)[0]
        if (existingPage) {


            //console.log('Page exists:',existingPage)
            //console.log('Activity page exists:',activity.source.name)

            const existingPageData = JSON.parse(existingPage.rawData)

            const diff = deepDiff.diff(existingPageData,update)

            //Check for differences, update if so
            if (diff) {
                console.log('Updating update:',update.title)

                console.log('DeepDiff:',diff)

                page.page_id = existingPage.notionPageId
                const pageObject = await notion.pages.update(page)

                updates.push({
                    update: updateTitle,
                    type: "update",
                    diff: diff
                })

                //Update DB
                const data = {
                    rawData: JSON.stringify(update)
                }
                appwriteDb.updateDocument('notionIds',user.userId,existingPage['$id'],data)

            } else {
                //console.log('Pages match. Not updating')
            }


            
        } else {
            //console.log("Activity page doesn't exist")
            console.log('Update created:',update.title)

            //console.log('Page:',page)

            const pageObject = await notion.pages.create(page)

            updates.push({
                update: updateTitle,
                type: "create"
            })

            const docData = {
                name: update.title,
                notionPageId: pageObject.id,
                brightspaceId: update.id,
                type: "update",
                rawData: JSON.stringify(update)
            }

            appwriteDb.createDocument('notionIds',user.userId,appwrite.ID.unique(),docData)
        }

    }


}






async function brightspaceQuery(query,token) {
    const endpoint = "https://usergraph.api.brightspace.com/graphql"

    //console.log('token:',token)

    const headers = {
        "Content-Type": 'application/json',
        "Authorization": `Bearer ${token}`
    }

    const body = {
        operationName: 'Activities',
        query: query,
        variables: {}
    }

    const postData = {
        method: 'post',
        body: JSON.stringify(body),
        headers: headers
    }


    const response = await fetch(endpoint, postData)

    const data = await response.json()

    //console.log('Response QL:',data.data)
    //console.log('Response QL:',await response.text())

    return data.data

}

function getDate(date) {

    //Does not work in Docker. Cannot set local timezone in Docker

    /* if (date) {
        const d = new Date(date);
        //console.log('Original date: ',d.toISOString())
        let dtOffset = new Date(d.setMinutes(d.getMinutes() - d.getTimezoneOffset()));
        //console.log('Converted date:',dtOffset.toISOString())
        return dtOffset.toISOString()
    } else {
        //console.log('Null date. returning nothing')
        return null
    } */


    if (date) {
        const d = new Date(date)
        const dConv = d.toLocaleString(locale,{timeZone: tzLong})

        const dNew = new Date(dConv + ', UTC').toISOString()

        return dNew
    } else {
        return null
    }

}

function getTz(date) {
    const d = new Date(date);
}

function getSemester() {

    var result;

    //Spring
    if (today >= springSemester.start && today <= springSemester.end) {
        //console.log('Spring')
        result = springSemester
    }

    //Summer
    if (today >= summerSemester.start && today <= summerSemester.end) {
        //console.log('Summer')
        result = summerSemester
    }

    //Fall
    if (today >= fallSemester.start && today <= fallSemester.end) {
        //console.log('Fall')
        result = fallSemester
    }

    var newResult = {}

    newResult.start = result.start.toISOString()
    newResult.end = result.end.toISOString()

    return newResult
}

async function resetActivities(user) {

    //var activities = await appwriteDb.listDocuments('notionIds',user.userId,awQuery)
    var activities = await getDocuments('notionIds',user.userId)
    activities = activities.filter(x => x.type == 'activity')

    //console.log('Activities:',activities)

    for (const activity of activities) {
        console.log('Deleting entry for',activity.name)
        const res = await appwriteDb.deleteDocument('notionIds',user.userId,activity['$id'])
    }

}

async function resetUpdates(user) {

    //var updates = await appwriteDb.listDocuments('notionIds',user.userId,awQuery)
    var updates = await getDocuments('notionIds',user.userId)
    updates = updates.filter(x => x.type == 'update')

    //console.log('Activities:',activities)

    for (const update of updates) {
        console.log('Deleting entry for',update.name)
        const res = await appwriteDb.deleteDocument('notionIds',user.userId,update['$id'])
    }

}

async function getDocuments(db,collection) {
    const limit = 75

    async function callDb(offset) {
        const res = await appwriteDb.listDocuments(db,collection,[appwrite.Query.limit(limit),appwrite.Query.offset(offset)])
        //console.log(`DB call ${Math.ceil(offset/limit)+1} of ${(offset/limit)+1} for DB: ${db}, Collection: ${collection}`)
        return res
    }

    const res = await callDb(0)

    const totalDocs = res.total
    const returnedDocs = res.documents.length

    const totalPages = Math.ceil(totalDocs/returnedDocs)

    var allDocs = res.documents

    //console.log('starting length:',allDocs.length)

    /* console.log('Total docs:',totalDocs)
    console.log('Returned docs:',returnedDocs)
    console.log('Total pages:',totalPages) */

    for (let i = 2; i < totalPages+1; i++) {
        const offset = limit * (i-1)
        const res = await callDb(offset)

        const ct = res.documents.length

        //console.log('Page:',i)
        //console.log(`Appending ${ct} documents`)

        allDocs = [...allDocs, ...res.documents]
    }

    //console.log('final length:',allDocs.length)

    return allDocs

}

//main()

async function test(user) {
    const docs = await getDocuments('notionIds',user.userId)

    console.log('final amount:',docs.length)
}