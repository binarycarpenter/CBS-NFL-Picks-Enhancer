(function($) {

  var winPercentClassName = "winPct";

  var getData = function() {

    // pull team names for each game from the page
    var games = [];
    var titleRows = $('#nflpicks tr.subtitle');
    $(titleRows[0]).find('.gameScore').each(function(index, gameElement) {
      var gameData = $(gameElement).find('td');
      games[index] = {
        homeTeam: $(gameData[0]).text(),
        homeScore: parseInt($(gameData[1]).text()) || 0,
        awayTeam: $(gameData[2]).text(),
        awayScore: parseInt($(gameData[3]).text()) || 0
      };
    });

    // pull data for each player's picks from the page
    var players = [];
    var currentPlayer = {};
    var playerRows = $('#nflplayerRows tr');
    playerRows.each(function(playerIndex, playerRow) {
      var player = { picks: [], winShares: 0, outcomesToWinShares: {}, row: playerRow };
      var isCurrent = $(playerRow).hasClass('bgFan');
      if(isCurrent) {
        player.isCurrent = true;
        currentPlayer = player;
      }

      var pickIndex = 0;
      $.each(playerRow.cells, function(cellIndex, cell) {
       cell = $(cell);
       if(cellIndex > 0 && !cell.hasClass(winPercentClassName)) {

          if(pickIndex == games.length) return false;

          var pick = cell.text();
          player.picks[pickIndex] = pick;

          var game = games[pickIndex++];
          game.unlocked |= cell.hasClass("unlocked");

          // this is the only way to tell the outcome of the game
          var isCorrect = cell.hasClass("correct");
          var isInProgress = cell.hasClass('inprogress');
          if(!isInProgress && (isCorrect || cell.hasClass("incorrect"))) {
            game.winner = isCorrect? pick : (pick == game.homeTeam)? game.awayTeam : game.homeTeam;
          }
        }
      });
      players.push(player);
    });

    var gamesToGo = 0;
    var totalOutcomes = 1;
    var possibleOutcomes = 1;
    $.each(games, function(gameIndex, game) {
      if(game.unlocked) {
        gamesToGo++
      }
      else {
        totalOutcomes *= 2;
        if(!game.winner) {
          possibleOutcomes *= 2;
        }
      }
    });

    return {
      games: games,
      players: players,
      currentPlayer: currentPlayer,
      totalOutcomes: totalOutcomes,
      possibleOutcomes: possibleOutcomes,
      gamesToGo: gamesToGo,
      titleRows: titleRows,
      playerRows: playerRows
    }
  };

  // recursively try every outcome permutation and accumulate win stats data for each
  var accumulateAllPossibilities = function(pageData, outcomes, currentIndex) {

    // we've worked through all the games, time to calculate who won with these outcomes
    if(pageData.games.length == currentIndex) {
      accumulateWinShares(pageData, outcomes);
      return;
    }

    // if this game is already decided, add the actual winner to the outcome, and recurse
    // or if picks aren't revealed yet for this game, no need to explore either outcome
    if(pageData.games[currentIndex].unlocked) {
      accumulateAllPossibilities(pageData, outcomes, currentIndex + 1);
    }

    // otherwise recursively branch to both possible outcomes
    else {
      var outcomes1 = outcomes.slice();
      outcomes1[currentIndex] = pageData.games[currentIndex].homeTeam;

      var outcomes2 = outcomes.slice();
      outcomes2[currentIndex] = pageData.games[currentIndex].awayTeam;

      accumulateAllPossibilities(pageData, outcomes1, currentIndex + 1);
      accumulateAllPossibilities(pageData, outcomes2, currentIndex + 1);
    }
  };

  var accumulateWinShares = function(pageData, outcomes) {
    var results = getResults(pageData, outcomes);
    var previousWinShares = 0;

    for(var score = 0; score <= outcomes.length; score++) {
      var resultsForScore = results[score];
      if(resultsForScore) {
        var winShare = null;
        $.each(resultsForScore.playersWithScore, function(playerIndex, player) {
          if(results.isImpossible && !player.isCurrent) {
            return;
          }

          if(winShare === null) {
            winShare = resultsForScore.chanceToOvertake - (previousWinShares / resultsForScore.playersWithScore.length);
          }

          if(winShare > 0) {
            if(!results.isImpossible) {
              if(pageData.gamesToGo === 0) {
                var tieBreakWinners = tieBreakWinner(pageData, resultsForScore.playersWithScore);
                winShare = tieBreakWinners.indexOf(player) >= 0? 1 : 0;
              }
              player.winShares += winShare;
              previousWinShares += winShare;
            }
            if(player.isCurrent) {
              // outcomeToWins maps a team name the number of wins for this player when that team wins
              $.each(outcomes, function(gameIndex, outcome) {
                if(!results.isImpossible || pageData.games[gameIndex].winner) {
                  player.outcomesToWinShares[outcome] = (player.outcomesToWinShares[outcome] || 0) + winShare;
                }
              });
            }
          }
        });
      }
    }
  };

  var getResults = function(pageData, outcomes) {
    var results = {};
    $.each(pageData.players, function(playerIndex, player){
      var score = 0;
      $.each(outcomes, function(outcomeIndex, outcome) {
        if(player.picks[outcomeIndex] === outcome) {
          score++;
        }
        if(pageData.games[outcomeIndex].winner && pageData.games[outcomeIndex].winner != outcome) {
          results.isImpossible = true;
        }
      });
      if(!results[score]) {
        results[score] = { chanceToOvertake: 0, playersWithScore: [] };
      }
      results[score].playersWithScore.push(player);
    });

    var playersTiedOrAhead = 0;
    var gamesBack = 0;
    var totalGamesToMakeUp = 0;
    for(var score = outcomes.length; score >= 0; score--) {
      var resultsForScore = results[score];
      if(resultsForScore) {
        playersTiedOrAhead += resultsForScore.playersWithScore.length;
        resultsForScore.chanceToOvertake = chanceToWin(gamesBack, totalGamesToMakeUp, pageData.gamesToGo, playersTiedOrAhead);
      }
      gamesBack = Math.min(playersTiedOrAhead, gamesBack + 1);
      totalGamesToMakeUp += playersTiedOrAhead;
    }
    return results;
  };

  // cache results of the following math intensive functions to speed things up a little
  var memoize = function(fn) {
    return function () {
      var args = Array.prototype.slice.call(arguments);
      var hash = JSON.stringify(args);
      fn.memoize || (fn.memoize = {});
      return (hash in fn.memoize) ? fn.memoize[hash] : fn.memoize[hash] = fn.apply(this, args);
    };
  };

  var chanceToWin = memoize(function(gamesBack, totalGamesToMakeUp, gamesToGo, playersTiedOrAhead) {
    // 0 chance if you're more games back than games to go
    if(gamesBack > gamesToGo) {
      return 0;
    }
    // if there are 0 games left, and we didn't return above, you must be in first place
    if(gamesToGo === 0) {

    }
    else {
      return chanceToMakeUpGames(gamesBack, gamesToGo) / playersTiedOrAhead;
    }
  });

  var chanceToMakeUpGames = memoize(function(gamesBack, gamesToGo) {
    var total = 0;
    for(var x = gamesBack; x <= gamesToGo; x++) {
       total += chooseXFromN(x, gamesToGo, .25);
    }
    return total;
  });

  var chooseXFromN = memoize(function(x, n, p) {
    return (fact(n) / (fact(x) * fact(n - x))) * Math.pow(p, x) * Math.pow(1 - p, n - x);
  });

  var fact = memoize(function(x) {
    if(x < 2) return 1;
    else return x * fact(x - 1);
  });

  var tieBreakWinner = function(pageData, tiedPlayers) {
    var mnfGame = pageData.games[pageData.games.length - 1];
    var mnfPoints = mnfGame.homeScore + mnfGame.awayScore;
    var minDiff;
    var winningPlayer = null;
    for(var i = 0; i < tiedPlayers.length; i++) {
      var mnfPointGuess = tiedPlayers.row.cells[pageData.games[pageData.games.length + 1]];
      var diff = Math.abs(mnfPoints - parseInt(mnfPointGuess));
      if(!winningPlayer || diff < minDiff) {
        winningPlayer = [tiedPlayers[i]];
        minDiff = diff;
      }
      else if(diff === minDiff) {
        winningPlayer.push(tiedPlayers[i]);
      }
    }
  };

  var addDataToPage = function(data) {
    var numOrigCols = data.games.length + 4;
    addColumn(numOrigCols, data, 'Win<br>Chance', winPercentClassName, function(player) {
      return getWinPct(player.winShares, data.possibleOutcomes) + "%";
    });

    var customRow = data.titleRows[3];
    if(!customRow) {
      var text = '<tr class="subtitle">';
      for(var i = 0; i < numOrigCols + 1; i++) text += '<td class="' + winPercentClassName + '"></td>';
      text += '</tr>';
      customRow = $(text);
      $(data.titleRows[2]).after(customRow);
      data.titleRows[3] = customRow;
    }
    customRow = $(customRow);

    $.each(customRow.find('td'), function(index, cell) {

      var html = "";
      if(index === 0) {
        html = "Win chances<br/>by game";
      }
      else {
        var gameIndex = index - 1;
        var game = data.games[gameIndex];
        if(game && !game.unlocked) {
          var homeWinPct = getWinPct(data.currentPlayer.outcomesToWinShares[game.homeTeam], data.totalOutcomes);
          var homeColor = game.homeTeam == data.currentPlayer.picks[gameIndex]? "#40a251" : "#d8383a";
          var awayWinPct = getWinPct(data.currentPlayer.outcomesToWinShares[game.awayTeam], data.totalOutcomes);
          var awayColor = game.awayTeam == data.currentPlayer.picks[gameIndex]? "#40a251" : "#d8383a";
          html = '<span style="color:' + homeColor + '">' + homeWinPct + '%</span> <br> ' +
                 '<span style="color:' + awayColor + '">' + awayWinPct + '%</span>';
        }
      }
      $(cell).html(html);
    });
  };

  var addColumn = function(index, data, title, className, playerToTextFn) {
    $.each(data.titleRows, function(rowIndex, titleRow) {
      var existingCell = $(titleRow.cells[index]);
      var text = rowIndex == 0? title : '';
      if(existingCell.hasClass(className)) {
        existingCell.html(text);
      }
      else {
        var cellBefore = $(titleRow.cells[index - 1]);
        cellBefore.after($('<td class="' + className + '">' + text +'</td>'));
      }
    });

    $.each(data.players, function(playerIndex, player) {
      var existingCell = $(player.row.cells[index]);
      if(existingCell.hasClass(className)) {
        existingCell.html(playerToTextFn(player));
      }
      else {
        var cellBefore = $(player.row.cells[index - 1]);
        cellBefore.after($('<td class="' + className + '">' + playerToTextFn(player) +'</td>'));
      }
    });
  };

  var getWinPct = function(winShares, numOutcomes) {
    winShares = winShares || 0;
    return Math.round((winShares * 10000) / numOutcomes) / 100;
  };

  var oldPageData = null;

  var run = function() {
    console.log("fetching data from page");
    var newPageData = getData();
    // make updates if game data has changed or this is the first run
    if(oldPageData == null || (oldPageData.totalOutcomes != newPageData.totalOutcomes ||
                               oldPageData.possibleOutcomes != newPageData.possibleOutcomes ||
                               oldPageData.gamesToGo != newPageData.gamesToGo)) {
      console.log("calculating win chances");
      // accumulate data about which player wins in all possible outcome permutations
      accumulateAllPossibilities(newPageData, [], 0);
      addDataToPage(newPageData);
      oldPageData = newPageData;
    }
  };

  run();
  setInterval(run, 30 * 1000);

})(jQuery);