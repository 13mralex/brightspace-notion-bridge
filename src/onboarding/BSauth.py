from urllib.parse import urlparse
from urllib import parse
import requests
import json
import base64
import sys
import time
import hmac
import hashlib
import pickle
import os

institutionsUrl = "https://lms-disco.api.brightspace.com/institutions"

purdueUrl = "https://purdue.brightspace.com/d2l/lp/auth/saml/initiate-login?entityId=https://idp.purdue.edu/idp/shibboleth"
passTargetCreds = "&target=%2fd2l%2fauth%2fapi%2ftoken%3fx_a%3dMCHLKRukvOZMCV1hchcsgg%26x_b%3dKs2085_Vb5586Nx7hDzkPcctWHt3WqNlERv7VHJYqT8%26x_target%3dhttp%253a%252f%252fpulse.brightspace.com%252fandroid%252ftrustedURL"

finalApiKey = ""

#App Info
appId = "MCHLKRukvOZMCV1hchcsgg"
appKey = "OextryfmALGx0PbknzAbdg"
baseUrl = "https://purdue.brightspace.com"

currentDir = os.path.dirname(__file__)

def promptInstitutions(query):
    query = parse.quote(query)
    #print(query)
    url = institutionsUrl+"?contains="+query
    results = requests.get(url).text
    results = json.loads(results)
    results = results["entities"]
    
    #print(results)
    
    res = {}
    
    for i,x in enumerate(results):
        #print(i)
        name = results[i]["properties"]["name"]
        link = results[i]["links"][1]["href"]
        #print(name+": "+link)
        
        sel = "["+str(i+1)+"] "+name

        res[i+1] = {}
        res[i+1] = {"name": name, "link": link}

        print(sel)
    
    selection = input("Select your institution: ")
    selection = int(selection)
    
    #print(selection)
    #print(json.dumps(res))
    
    
    name = res[selection]["name"]
    link = res[selection]["link"]
    
    if name == "Purdue University System":
        site = promptPurdueSite()
        name = site["name"]
        link = site["link"]
    
    #print("Selected:",name+" ("+link+")")
    
    print("Open this URL in a browser to complete setup.")
    print(link+passTargetCreds)
    return loginStep1(input("After logging in, copy URL from your browser and paste it here: "),"oauth2")
    #return res[selection]

def promptPurdueSite():
    site = {}
    site[0] = {"name":"Purdue West Lafayette","link":"https://purdue.brightspace.com/d2l/lp/auth/saml/initiate-login?entityId=https://idp.purdue.edu/idp/shibboleth"}
    site[1] = {"name":"Purdue Fort Wayne","link":"https://purdue.brightspace.com/d2l/lp/auth/saml/initiate-login?entityId=https://shibadprod.pfw.edu/idp/shibboleth"}
    site[2] = {"name":"Purdue Global","link":"https://purdueglobal.brightspace.com"}
    site[3] = {"name":"Purdue Northwest","link":"https://purdue.brightspace.com/d2l/lp/auth/saml/initiate-login?entityId=https://idp.purdue.edu/idp/shibboleth"}
    
    for i,x in enumerate(site):
        #print(i)
        name = site[i]["name"]
        link = site[i]["link"]
        #print(name+": "+link)
        
        sel = "["+str(i+1)+"] "+name

        print(sel)   
    
    selection = input("Choose your Purdue Campus: ")
    selection = int(selection)
    return site[selection-1]

def loginStep1(authUrl,dest):
    
    #Redirect URL
    targetUrl = "http://pulse.brightspace.com/android/trustedURL"
    
    destUrl = ""
    
    if dest == "oauth2":
        destUrl = "/d2l/api/lp/1.5/auth/oauth2upgrade"
    elif dest == "apiLogin":
        destUrl = "/d2l/lp/auth/api/apilogin.d2l"
    
    #OAuth2 URL for Authorization Token renewal
    #oauth2Url = "/d2l/api/lp/1.5/auth/oauth2upgrade"
    
    #url = sel["link"]
    
    #authUrl = input("Paste URL after Purdue login: ")
    
    userInfo = {}
    
    parsedUrl = urlparse(authUrl)
    
    parsedUrl = parse.parse_qsl(parsedUrl.query)
    parsedUrl = dict(parsedUrl)
    
    #print("userID: "+parsedUrl["x_a"])
    userId = parsedUrl["x_a"]
    userKey = parsedUrl["x_b"]
    userInfo["userId"] = parsedUrl["x_a"]
    userInfo["userKey"] = parsedUrl["x_b"]
    userInfo["institutionUrl"] = authUrl
    
    seconds = round(time.time())
    
    #seconds = 1642117705
    
    #print("Signature: ",formatSignature(oauth2Url,"POST",seconds))
    
    sig = formatSignature(destUrl,"POST",seconds)
    
    #print(generateSignature(userKey, sig))
    
    appKeyEncoded = generateSignature(appKey,sig)
    userKeyEncoded = generateSignature(userKey,sig)
    
    uri = buildAuthUri(appId,userId,appKeyEncoded,userKeyEncoded,seconds)
    
    finalUrl = baseUrl+destUrl+"?"+uri
    
    if dest == "apiLogin":
        return finalUrl  
    
    #print("Calling URL: "+finalUrl)
    
    response = requests.post(finalUrl)
    
    responseJson = json.loads(response.text)
    finalApiKey = responseJson["access_token"]
    
    userInfo["apiKey"] = finalApiKey
    
    dumpUserInfo(userInfo)
    
    #print("API Key: "+finalApiKey)
    return userInfo
    #print("RESPONSE: "+response.text)
    
def formatSignature(url,method,time):
    sig = str.upper(method)
    sig = sig+"&"
    sig = sig+str.lower(url)
    sig = sig+"&"
    sig = sig+str(time)
    return sig

def buildAuthUri(appId,userId,appKey,userKey,seconds):
    
    params = {}
    params["x_a"] = appId
    params["x_b"] = userId
    params["x_c"] = appKey
    params["x_d"] = userKey
    params["x_t"] = seconds
    #print(params)
    uri = parse.urlencode(params)
    #print("URI: ",uri)
    #params["target"] = "https://purdue.brightspace.com/d2l/student-ad/6606_2000_488150/469927/196550"
    #print(baseUrl+"/d2l/lp/auth/api/apilogin.d2l?"+parse.urlencode(params))
    
    return uri
    
    
    
def generateSignature(key, message):
    key = bytes(key, 'utf-8')
    message = bytes(message, 'utf-8')
    
    hash = hmac.new(key, message, hashlib.sha256)    
    
    res = base64.urlsafe_b64encode(hash.digest())
    res = res.decode()
    res = res.rstrip("b=")
    
    return res

def dumpUserInfo(userInfo):
    userId = userInfo["userId"]
    userKey = userInfo["userKey"]
    finalApiKey = userInfo["apiKey"]
    
    userDir = currentDir+"/variables/users/"+userId
    
    
    if os.path.isdir(userDir):
        directory = "OK"
    else:
        #print("Dir does not exist, creating")
        os.mkdir(userDir)
    
    f = open(userDir+"/info.json","w")
    f.write(json.dumps(userInfo, indent=2))
    f.close()
    
def firstTime():    
    print("Adding user...")
    return promptInstitutions(input("Search for your institution: "))

def update():
    print("Generating new API Key...")
    dirs = os.listdir(currentDir+"/variables/users/")
    
    users = []
    info = {}
    
    for userDir in dirs:
        #Exclude .ds_store files
        if userDir.startswith(".") == False:
            #print("---User: "+userDir)
            f = open(currentDir+"/variables/users/"+userDir+"/info.json","r")
            info = json.loads(f.read())
            #print("--Key: "+info["userKey"])
            #print("returning key: "+loginStep1(info["institutionUrl"]))
            #loginStep1(info["institutionUrl"])
            users.append(loginStep1(info["institutionUrl"],"oauth2"))
            
            #loginLink(loginStep1(info["institutionUrl"],"apiLogin"))
            
            f.close()
    #print(users)
    return users

def loginLink(userInfo):  
    
    print("INFO:",userInfo+"&target=https://purdue.brightspace.com/d2l/lms/quizzing/quizzing.d2l?ou%3D469927%26qi%3D524931")